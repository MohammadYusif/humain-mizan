"""Learning loop: lawyers' decisions become proposed playbook amendments, approved by a human.

Evidence per rule, from decisions on finished runs:
- "accepted": legal approved a contract the agent escalated (approve_contract), or discarded a
  redline the agent wanted to send (discard). The deviation was acceptable in practice.
- "upheld": legal requested changes / rejected, or sent the redline. The rule held.

A non-critical rule accepted at least MIN_ACCEPTED times, more often than upheld, yields a proposal:
treat the accepted wording as an acceptable fallback. When a human accepts it, it is stored in
`learning.json` (under data/, local to the organisation) and the agent's `list_playbook` shows the
accepted wording, so similar clauses stop being flagged. Deterministic red flags and critical rules
are never relaxed by this loop; for those the loop only reports what it saw.
"""

from __future__ import annotations

import hashlib
import json
import time
from typing import Any

from .challenge.playbook import BY_ID
from .config import Settings
from .workflow import read_decision, run_state

MIN_ACCEPTED = 2
ACCEPTED = {"approve_contract", "discard"}
UPHELD = {"request_changes", "reject", "send"}


def _store_path(settings: Settings):
    return settings.uploads_dir.parent / "learning.json"


def load_store(settings: Settings) -> dict[str, Any]:
    p = _store_path(settings)
    if p.is_file():
        return json.loads(p.read_text(encoding="utf-8"))
    return {"amendments": [], "rejected": []}


def _save(settings: Settings, store: dict[str, Any]) -> None:
    p = _store_path(settings)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(store, indent=2, ensure_ascii=False), encoding="utf-8")


def signals(settings: Settings) -> dict[str, dict[str, Any]]:
    """Per rule: accepted/upheld counts and the evidence (run, doc, clause, quote, decision)."""
    out: dict[str, dict[str, Any]] = {}
    base = settings.runs_dir
    if not base.is_dir():
        return out
    for d in sorted(base.iterdir()):
        if not (d / "decision.json").is_file() or d.name.startswith("eval-"):
            continue
        decision = read_decision(settings, d.name) or {}
        kind = (
            "accepted"
            if decision.get("decision") in ACCEPTED
            else ("upheld" if decision.get("decision") in UPHELD else None)
        )
        if kind is None:
            continue
        view = run_state(settings, d.name)["view"] or {}
        for f in view.get("findings", []):
            if f["severity"] not in ("major", "critical"):
                continue
            s = out.setdefault(f["rule_id"], {"accepted": 0, "upheld": 0, "evidence": []})
            s[kind] += 1
            s["evidence"].append(
                {
                    "run_id": d.name,
                    "doc_id": view.get("doc_id"),
                    "clause_id": f["clause_id"],
                    "quote": f["quote"],
                    "decision": decision.get("decision"),
                    "note": decision.get("note", ""),
                    "kind": kind,
                }
            )
    return out


def _proposal_id(rule_id: str, quotes: list[str]) -> str:
    return rule_id + "-" + hashlib.sha1("\n".join(sorted(quotes)).encode()).hexdigest()[:8]


def insights(settings: Settings) -> dict[str, Any]:
    store = load_store(settings)
    accepted_ids = {a["id"] for a in store["amendments"]}
    sig = signals(settings)
    proposals, notes = [], []
    for rule_id, s in sorted(sig.items()):
        rule = BY_ID.get(rule_id)
        if rule is None:
            continue
        acc = [e for e in s["evidence"] if e["kind"] == "accepted"]
        if rule.severity == "critical":
            if acc:
                notes.append(
                    {
                        "rule_id": rule_id,
                        "text": f"Legal accepted a critical {rule.clause_type.lower()} deviation "
                        f"{len(acc)} time(s). Critical rules are never relaxed automatically; "
                        "review the policy itself if this is intended.",
                        "evidence": acc,
                    }
                )
            continue
        if s["accepted"] < MIN_ACCEPTED or s["accepted"] <= s["upheld"]:
            continue
        quotes = list(dict.fromkeys(e["quote"] for e in acc))
        pid = _proposal_id(rule_id, quotes)
        if pid in accepted_ids or pid in store["rejected"]:
            continue
        proposals.append(
            {
                "id": pid,
                "rule_id": rule_id,
                "clause_type": rule.clause_type,
                "current_fallback": rule.fallback,
                "proposed_addition": "Accepted by legal in practice: "
                + "; ".join(f"“{q}”" for q in quotes),
                "why": f"Legal accepted this deviation {s['accepted']} time(s) and upheld the rule "
                f"{s['upheld']} time(s).",
                "effect": "The agent will treat clauses worded like this as an accepted fallback and stop "
                "flagging them. Deterministic red flags still apply.",
                "evidence": acc,
            }
        )
    return {
        "signals": {
            r: {"accepted": s["accepted"], "upheld": s["upheld"]} for r, s in sorted(sig.items())
        },
        "proposals": proposals,
        "notes": notes,
        "amendments": store["amendments"],
        "min_accepted": MIN_ACCEPTED,
    }


def decide_proposal(
    settings: Settings, proposal_id: str, action: str, note: str = ""
) -> dict[str, Any]:
    if action not in ("accept", "reject"):
        raise ValueError("action must be accept or reject")
    current = next((p for p in insights(settings)["proposals"] if p["id"] == proposal_id), None)
    if current is None:
        raise FileNotFoundError(proposal_id)
    store = load_store(settings)
    if action == "reject":
        store["rejected"].append(proposal_id)
        _save(settings, store)
        return {"id": proposal_id, "status": "rejected"}
    amendment = {
        "id": proposal_id,
        "rule_id": current["rule_id"],
        "text": current["proposed_addition"],
        "note": note,
        "at": time.time(),
        "evidence_runs": [e["run_id"] for e in current["evidence"]],
    }
    store["amendments"].append(amendment)
    _save(settings, store)
    return {**amendment, "status": "accepted"}


def amendments_by_rule(settings: Settings) -> dict[str, list[str]]:
    out: dict[str, list[str]] = {}
    for a in load_store(settings)["amendments"]:
        out.setdefault(a["rule_id"], []).append(a["text"])
    return out
