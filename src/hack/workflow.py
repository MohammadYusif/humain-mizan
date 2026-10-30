"""The autonomous process around single reviews: batch queue, legal inbox, human decisions, eval proof.

Everything is derived from files under runs/ (traces, decision.json, batch manifests) so a restart
loses nothing and the UI, CLI and evals all read the same source of truth.
"""

from __future__ import annotations

import json
import re
import threading
import time
import uuid
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from .challenge import contracts as C
from .challenge import policy as P
from .challenge.messages import requested_changes
from .challenge.review import injection_reasons
from .challenge.tripwires import scan
from .challenge.view import review_view
from .config import Settings
from .evals import final_route, load_cases
from .llm import Provider
from .service import TASK_DOC as _TASK_DOC
from .service import run_task
from .tracing import read_trace

DECISIONS = {
    "legal_review": ("approve_contract", "request_changes", "reject"),
    "approve_send": ("send", "discard"),
    # the agent finished without a route: a lawyer reviews it like an escalation
    "unrouted": ("approve_contract", "request_changes", "reject"),
}
UNROUTED_REASON = "The agent stopped before computing a route; a lawyer must review this contract"


def task_doc(trace_path: Path) -> str | None:
    """The contract a run was asked to review, from its first event only (cheap enough to filter
    every run by contract)."""
    try:
        with trace_path.open(encoding="utf-8") as f:
            first = json.loads(f.readline() or "{}")
    except (OSError, ValueError):
        return None
    m = _TASK_DOC.search(first.get("task", "")) if first.get("type") == "run_start" else None
    return m.group(1) if m else None


def reviews_used(settings: Settings) -> int:
    """Reviews run on this deployment that may have called the model: every run except evals and
    demo replays (replays never call it)."""
    base = settings.runs_dir
    if not base.is_dir():
        return 0
    return sum(
        1
        for d in base.iterdir()
        if (d / "trace.jsonl").is_file() and not d.name.startswith(("eval-", "demo-"))
    )


class QuotaReached(Exception):
    """The deployment's review allowance (HACK_MAX_REVIEWS) would be exceeded."""


def check_quota(settings: Settings, more: int, in_flight: int = 0) -> None:
    """Refuse `more` new reviews when they would pass the allowance; nothing is started."""
    cap = settings.max_reviews
    if cap is None:
        return
    used = reviews_used(settings) + in_flight
    if used + more > cap:
        left = max(0, cap - used)
        raise QuotaReached(
            f"This demo allows {cap} reviews in total and {left} are left"
            + (f", so a batch of {more} cannot start" if more > 1 else "")
            + ". The guided demo, Proof and every finished review still work."
        )


def latest_reviews(settings: Settings) -> dict[str, dict[str, Any]]:
    """For each contract, its newest finished review (not eval runs): who started it, when, and the
    route. Lets a second person open that result instead of reviewing the contract again."""
    base = settings.runs_dir
    out: dict[str, dict[str, Any]] = {}
    if not base.is_dir():
        return out
    for d in base.iterdir():
        t = d / "trace.jsonl"
        if d.name.startswith("eval-") or not t.is_file():
            continue
        doc = task_doc(t)
        if doc is None:
            continue
        at = t.stat().st_mtime
        if doc in out and out[doc]["at"] >= at:
            continue
        tr = read_trace(base, d.name)
        if not any(e["type"] == "run_end" and e.get("stop_reason") != "error" for e in tr):
            continue
        start = tr[0] if tr and tr[0].get("type") == "run_start" else {}
        out[doc] = {
            "run_id": d.name,
            "by": start.get("started_by"),
            "route": final_route(tr),
            "at": at,
        }
    return out


class InvalidDecision(ValueError):
    """The request itself is malformed (HTTP 400), as opposed to a state conflict (HTTP 409)."""


def run_state(settings: Settings, run_id: str) -> dict[str, Any]:
    """Status, route and review view of one run, from its trace."""
    try:
        tr = read_trace(settings.runs_dir, run_id)
    except FileNotFoundError:
        return {"run_id": run_id, "status": "queued", "route": None, "view": None, "end": None}
    end = next((e for e in tr if e["type"] == "run_end"), None)
    status = (
        "running" if end is None else ("error" if end.get("stop_reason") == "error" else "done")
    )
    route = final_route(tr)
    view = review_view(tr)
    if view["doc_id"] is None:  # the model never loaded it (e.g. failed first call): use the task
        start = next((e for e in tr if e["type"] == "run_start"), {})
        if m := _TASK_DOC.search(start.get("task", "")):
            view["doc_id"] = m.group(1)
    kept_from_model = (view.get("data_policy") or {}).get("allowed") is False
    # Pattern checks run here, without a model, so a lawyer sees the red flags either way.
    if (
        (route is None or kept_from_model)
        and status == "done"
        and not view["tripwires"]
        and view["doc_id"]
    ):
        view["tripwires"] = _tripwires_without_score(settings, view)
    # The model saw placeholders for names and numbers; people see the originals again.
    if (r := P.load_redactor(settings.runs_dir / run_id, view["doc_id"])) is not None:
        view = P.restore_view(view, r)
    # Runs recorded before injected instructions were quoted: quote them now, from the contract.
    old = [r for r in view["reasons"] if "with instructions aimed at an AI reviewer" in r]
    if old and view["injected"] and view["doc_id"]:
        try:
            contract = C.load_contract(settings.contract_dirs(), view["doc_id"])
        except (FileNotFoundError, ValueError):
            contract = None
        if contract is not None:
            at = view["reasons"].index(old[0])
            rest = [r for r in view["reasons"] if r not in old]
            view["reasons"] = rest[:at] + injection_reasons(contract, view["injected"]) + rest[at:]
    # What a review shows as sent is the message code builds from the redlines, the same as the
    # one that leaves, also for runs recorded before messages were built this way.
    if any(a["kind"] == "counterparty" for a in view["actions"]):
        neat = draft_for(view, settings)
        for a in view["actions"]:
            if a["kind"] == "counterparty":
                a["text"] = neat
    return {"run_id": run_id, "status": status, "route": route, "view": view, "end": end}


def _tripwires_without_score(settings: Settings, view: dict[str, Any]) -> list[dict[str, Any]]:
    """Red flags for a run the model never scored, so a lawyer still sees them."""
    try:
        contract = C.load_contract(settings.contract_dirs(), view["doc_id"])
    except (FileNotFoundError, ValueError):
        return []
    recorded = {f["rule_id"] for f in view["findings"]}
    cleared = {(c["clause_id"], c["rule_id"]) for c in view["cleared"]}
    out = []
    for t in scan(contract):
        if t.critical:
            status = "critical"
        elif t.rule_id in recorded:
            status = "recorded"
        elif (t.clause_id, t.rule_id) in cleared:
            status = "cleared"
        else:
            status = "unresolved"
        out.append({**t.__dict__, "status": status})
    return out


def read_decision(settings: Settings, run_id: str) -> dict[str, Any] | None:
    p = settings.runs_dir / run_id / "decision.json"
    return json.loads(p.read_text(encoding="utf-8")) if p.is_file() else None


def pending_kind(state: dict[str, Any], decision: dict[str, Any] | None) -> str | None:
    """What a human still has to do for this run, if anything. Eval runs are measurements: never."""
    if state["run_id"].startswith("eval-"):
        return None
    if state["status"] != "done" or decision is not None or state["view"] is None:
        return None
    if state["route"] is None:
        # only contract reviews need a lawyer; a run with no contract at all is not a review
        return "unrouted" if state["view"]["doc_id"] else None
    if state["route"] == "escalate":
        return "legal_review"
    # The process is owned by the route, not by whether the model remembered the follow-up:
    # a negotiate contract that nothing was actually sent for waits for a human send.
    if state["route"] == "negotiate" and not any(
        a["kind"] == "counterparty" and not a["dry_run"] for a in state["view"]["actions"]
    ):
        return "approve_send"
    return None


def draft_for(view: dict[str, Any], settings: Settings | None = None) -> str:
    """The agent's drafted counterparty message, or one composed from the redlines if it wrote none."""
    # Built from the redlines whenever there are any: never the model's own wording or layout.
    if any(f["severity"] in ("critical", "major") for f in view["findings"]):
        return requested_changes_message(view, settings)
    return next((a["text"] for a in view["actions"] if a["kind"] == "counterparty"), "")


# --- Legal inbox ---------------------------------------------------------------------------------


def inbox(settings: Settings) -> list[dict[str, Any]]:
    """Runs waiting for a human, newest first. Eval runs are excluded (they are measurements)."""
    base = settings.runs_dir
    if not base.is_dir():
        return []
    items = []
    for d in sorted(base.iterdir(), key=lambda p: p.stat().st_mtime, reverse=True):
        if not (d / "trace.jsonl").is_file() or d.name.startswith("eval-"):
            continue
        state = run_state(settings, d.name)
        kind = pending_kind(state, read_decision(settings, d.name))
        if kind is None:
            continue
        v = state["view"]
        if kind == "approve_send":
            agent_text = draft_for(v, settings)
        else:
            agent_text = next((a["text"] for a in v["actions"] if a["kind"] == "legal"), "")
        items.append(
            {
                "run_id": d.name,
                "kind": kind,
                "doc_id": v["doc_id"],
                "route": state["route"],
                "risk_score": v["risk_score"],
                "counts": v["counts"],
                "reasons": v["reasons"] or ([UNROUTED_REASON] if kind == "unrouted" else []),
                "findings": v["findings"],
                "tripwires": v["tripwires"],
                "replay_of": read_trace(settings.runs_dir, d.name)[0].get("replay_of"),
                "agent_text": agent_text,
                "options": list(DECISIONS[kind]),
                "created": (d / "trace.jsonl").stat().st_mtime,
            }
        )
    return items


def requested_changes_message(view: dict[str, Any], settings: Settings | None = None) -> str:
    """The counterparty message, composed from the recorded redlines (see challenge/messages.py):
    an opening line, then one numbered change per finding, cited by the contract's own numbering."""
    title, texts = view["doc_id"], {}
    if settings is not None and view.get("doc_id"):
        try:
            contract = C.load_contract(settings.contract_dirs(), view["doc_id"])
            title, texts = contract.title or title, {c.id: c.text for c in contract.clauses}
        except (FileNotFoundError, ValueError):
            pass
    return requested_changes(title, view["findings"], texts) or f"Requested changes to {title}"


def decide(
    settings: Settings,
    run_id: str,
    decision: str,
    note: str = "",
    message: str | None = None,
    by: str = "human",
) -> dict[str, Any]:
    """Record a decision (a human's, or the workflow's own under the auto-send policy).
    send/request_changes put a message in the run's outbox."""
    state = run_state(settings, run_id)
    if state["status"] == "queued":
        raise FileNotFoundError(run_id)
    existing = read_decision(settings, run_id)
    if existing is not None:
        raise ValueError("already decided")
    kind = pending_kind(state, existing)
    if kind is None:
        raise ValueError("this run is not waiting for a human decision")
    if decision not in DECISIONS[kind]:
        raise InvalidDecision(f"decision must be one of {DECISIONS[kind]} for {kind}")
    out_msg = None
    if decision == "send":
        out_msg = message or draft_for(state["view"], settings)
    elif decision == "request_changes":
        out_msg = message or requested_changes_message(state["view"], settings)
    if out_msg:
        with (settings.runs_dir / run_id / "outbox.jsonl").open("a", encoding="utf-8") as f:
            rec = {
                "ts": time.time(),
                "kind": "counterparty",
                "doc_id": state["view"]["doc_id"],
                "message": out_msg,
                "by": by,
            }
            f.write(json.dumps(rec, ensure_ascii=False) + "\n")
    rec = {
        "decision": decision,
        "kind": kind,
        "note": note,
        "message": out_msg,
        "by": by,
        "at": time.time(),
    }
    (settings.runs_dir / run_id / "decision.json").write_text(
        json.dumps(rec, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    return rec


# --- Batch queue ---------------------------------------------------------------------------------


class ReviewBusy(Exception):
    """The contract is already being reviewed; `holder` says by whom and since when."""

    def __init__(self, doc_id: str, holder: dict[str, Any]):
        self.doc_id, self.holder = doc_id, holder
        who = holder.get("by") or "someone"
        super().__init__(
            f"{doc_id} is being reviewed by {who} since {holder.get('since', '')[11:16]} UTC"
        )


class ReviewLocks:
    """One review at a time per contract. Two people pressing Review on the same contract, or a
    batch that includes a contract someone is reviewing, get a clear refusal instead of two runs
    racing on the same file. Held in the API process, across its threads; released when the run
    ends however it ends."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._held: dict[str, dict[str, Any]] = {}

    def acquire(self, doc_id: str, by: str | None, run_id: str) -> None:
        with self._lock:
            if (h := self._held.get(doc_id)) is not None:
                raise ReviewBusy(doc_id, h)
            self._held[doc_id] = {
                "by": by,
                "run_id": run_id,
                "since": datetime.now(UTC).isoformat(timespec="seconds"),
            }

    def release(self, doc_id: str, run_id: str) -> None:
        with self._lock:
            if self._held.get(doc_id, {}).get("run_id") == run_id:
                del self._held[doc_id]

    def holder(self, doc_id: str) -> dict[str, Any] | None:
        with self._lock:
            h = self._held.get(doc_id)
            return dict(h) if h else None


class BatchRunner:
    """Runs many reviews in parallel in the API process. Manifests live in runs/batches/."""

    def __init__(
        self,
        settings: Settings,
        provider_factory: Callable[[], Provider] | None = None,
        workers: int = 3,
        locks: ReviewLocks | None = None,
    ):
        self.settings = settings
        self.provider_factory = provider_factory
        self.pool = ThreadPoolExecutor(max_workers=workers, thread_name_prefix="batch")
        self.lock = threading.Lock()
        self.pending: set[str] = set()  # run ids queued or running in this process
        self.locks = locks or ReviewLocks()

    @property
    def dir(self) -> Path:
        return self.settings.runs_dir / "batches"

    def start(self, doc_ids: list[str], auto_send: bool, by: str | None = None) -> dict[str, Any]:
        if not doc_ids:
            raise ValueError("no contracts selected")
        check_quota(self.settings, len(doc_ids), len(self.pending))
        if len(doc_ids) > 50:
            raise ValueError("max 50 contracts per batch")
        if len(set(doc_ids)) != len(doc_ids):
            raise ValueError("a contract appears twice in the batch")
        dirs = self.settings.contract_dirs()
        for d in doc_ids:
            C.load_contract(dirs, d)  # raises for unknown/unsafe ids before anything starts
        batch_id = "b" + time.strftime("%m%d%H%M%S") + uuid.uuid4().hex[:4]
        items = [
            {
                "doc_id": d,
                "run_id": f"{batch_id}-{re.sub(r'[^A-Za-z0-9_-]', '', d)[:45]}-{i}",
                "by": by,
            }
            for i, d in enumerate(doc_ids)
        ]
        # All or nothing: if any contract is already being reviewed, start none of them.
        taken: list[dict[str, str]] = []
        try:
            for it in items:
                self.locks.acquire(it["doc_id"], by, it["run_id"])
                taken.append(it)
        except ReviewBusy:
            for it in taken:
                self.locks.release(it["doc_id"], it["run_id"])
            raise
        manifest = {
            "batch_id": batch_id,
            "created": time.time(),
            "auto_send": auto_send,
            "items": items,
        }
        self.dir.mkdir(parents=True, exist_ok=True)
        (self.dir / f"{batch_id}.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
        run_settings = self.settings.model_copy(update={"approve_writes": auto_send})
        for it in items:
            with self.lock:
                self.pending.add(it["run_id"])
            self.pool.submit(self._run_one, run_settings, it)
        return manifest

    def _run_one(self, settings: Settings, item: dict[str, str]) -> None:
        try:
            provider = self.provider_factory() if self.provider_factory else None
            run_task(
                f"Review contract {item['doc_id']} and route it.",
                settings,
                provider=provider,
                run_id=item["run_id"],
                started_by=item.get("by"),
            )
        except Exception:
            pass  # the agent wrote an error + run_end into the trace; the batch view shows it
        else:
            # Auto-send policy: if the route says negotiate but the model never sent the redline,
            # the workflow sends it (composed from the recorded redlines) and records that it did.
            state = run_state(settings, item["run_id"])
            restricted = ((state["view"] or {}).get("data_policy") or {}).get(
                "sensitivity"
            ) == "restricted"
            if (
                settings.approve_writes
                and not restricted
                and pending_kind(state, None) == "approve_send"
            ):
                decide(settings, item["run_id"], "send", by="workflow (auto-send policy)")
        finally:
            with self.lock:
                self.pending.discard(item["run_id"])
            self.locks.release(item["doc_id"], item["run_id"])

    def list(self) -> list[dict[str, Any]]:
        if not self.dir.is_dir():
            return []
        files = sorted(self.dir.glob("*.json"), key=lambda p: p.stat().st_mtime, reverse=True)
        return [self.status(p.stem) for p in files[:20]]

    def status(self, batch_id: str) -> dict[str, Any]:
        path = self.dir / f"{batch_id}.json"
        if not re.fullmatch(r"[A-Za-z0-9]{1,32}", batch_id) or not path.is_file():
            raise FileNotFoundError(batch_id)
        manifest = json.loads(path.read_text(encoding="utf-8"))
        items, routes = [], {"approve": 0, "negotiate": 0, "escalate": 0, "unrouted": 0}
        cost = priced_cost = agent_s = 0.0
        needs_human = done = errors = unpriced = 0
        for it in manifest["items"]:
            st = run_state(self.settings, it["run_id"])
            decision = read_decision(self.settings, it["run_id"])
            kind = pending_kind(st, decision)
            end = st["end"] or {}
            if st["status"] == "done":
                done += 1
                routes[st["route"] or "unrouted"] += 1
            errors += st["status"] == "error"
            needs_human += kind is not None
            cost += end.get("cost_usd") or 0.0
            if end and end.get("priced") is False:
                unpriced += 1
            else:
                priced_cost += end.get("cost_usd") or 0.0
            agent_s += end.get("latency_s") or 0.0
            v = st["view"] or {}
            items.append(
                {
                    **it,
                    "status": st["status"],
                    "route": st["route"],
                    "risk_score": v.get("risk_score"),
                    "counts": v.get("counts"),
                    "pending": kind,
                    "decision": decision["decision"] if decision else None,
                    "decided_by": decision.get("by", "human") if decision else None,
                    "sent": any(
                        a["kind"] == "counterparty" and not a["dry_run"]
                        for a in v.get("actions", [])
                    ),
                    "cost_usd": end.get("cost_usd"),
                    "priced": end.get("priced"),
                    "latency_s": end.get("latency_s"),
                }
            )
        s = self.settings
        finished = [i for i in items if i["status"] in ("done", "error")]
        # An escalation costs a lawyer's targeted review; an unrouted or failed contract costs a
        # full manual review, so it saves nothing.
        human_min = (
            routes["escalate"] * s.legal_minutes_per_escalation
            + (routes["unrouted"] + errors) * s.manual_minutes_per_contract
        )
        return {
            "batch_id": manifest["batch_id"],
            "created": manifest["created"],
            "auto_send": manifest["auto_send"],
            "total": len(items),
            "done": done,
            "errors": errors,
            "routes": routes,
            "needs_human": needs_human,
            "cost_usd": round(cost, 4),
            # False when any finished run used a model with no known price (e.g. a local model).
            "priced": all(i["priced"] for i in finished) if finished else None,
            "priced_cost_usd": round(priced_cost, 4),  # the part of the cost we can price
            "unpriced_runs": unpriced,
            "agent_minutes": round(agent_s / 60, 2),
            "estimate": {
                "manual_hours": round((done + errors) * s.manual_minutes_per_contract / 60, 2),
                "human_hours_with_agent": round(human_min / 60, 2),
                "hours_saved": round(
                    ((done + errors) * s.manual_minutes_per_contract - human_min) / 60, 2
                ),
                "assumptions": f"{s.manual_minutes_per_contract:g} min manual review per contract "
                f"(also for contracts the agent could not route or failed on); "
                f"{s.legal_minutes_per_escalation:g} min lawyer time per escalation",
            },
            "items": items,
        }


# --- Proof: saved eval results -------------------------------------------------------------------


def eval_results(settings: Settings) -> list[dict[str, Any]]:
    """Per model (and `summary.variant`, e.g. "before red-flag tripwires"), the most complete saved
    eval of the current contract suite (ties: newest). The curated, git-tracked `proof_dir` is the
    published set; the local `results_dir` is only used when no proof files exist."""
    files = sorted(settings.proof_dir.glob("*.json")) if settings.proof_dir.is_dir() else []
    if not files and settings.results_dir.is_dir():
        files = sorted(settings.results_dir.glob("*.json"))
    known = {p.stem for d in settings.contract_dirs() for p in d.glob("*.md")}
    # Real-world contracts are not shipped (third-party text), but their labelled ids are, in every
    # batch next to the first one (cases.jsonl, cases-batch2.jsonl, ...).
    if settings.real_cases.parent.is_dir():
        for f in sorted(settings.real_cases.parent.glob("cases*.jsonl")):
            known |= {c["id"] for c in load_cases(f)}
    best: dict[tuple[str, str], tuple[int, float, dict[str, Any], Path]] = {}
    for p in files:
        try:
            data = json.loads(p.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            continue
        cases = data.get("cases", [])
        if (
            not cases
            or not all(c["id"] in known for c in cases)
            or "route_accuracy" not in data.get("summary", {})
        ):
            continue
        model = (
            data["summary"]["model"],
            data["summary"].get("variant") or "",
            data["summary"].get("suite") or "",
        )
        key = (len(cases), p.stat().st_mtime)
        if model not in best or key > best[model][:2]:
            best[model] = (*key, data, p)
    out = []
    # Current configuration first (no variant label), then best route accuracy, then cheapest.
    order = sorted(
        best.items(),
        key=lambda kv: (
            bool(kv[0][2]),  # main suite before held-out and real-world
            bool(kv[0][1]),
            -kv[1][2]["summary"].get("route_accuracy", 0),
            kv[1][2]["summary"].get("cost_usd") or 0,
            kv[0],
        ),
    )
    for (model, variant, suite), (_, mtime, data, p) in order:
        out.append(
            {
                "model": model,
                "variant": variant or None,
                "suite": suite or "main",
                "file": p.name,
                "date": mtime,
                "summary": data["summary"],
                "cases": [
                    {
                        k: c.get(k)
                        for k in (
                            "id",
                            "passed",
                            "expected_route",
                            "got_route",
                            "cost_usd",
                            "latency_s",
                            "labelled_rules",
                            "recorded_rules",
                            "checked_rules",
                            "independent_rules",
                        )
                    }
                    for c in data["cases"]
                ],
            }
        )
    return out
