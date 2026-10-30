from __future__ import annotations

import json
import re
from collections.abc import Callable
from typing import Any

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, JSONResponse, Response
from pydantic import BaseModel
from starlette.concurrency import run_in_threadpool

from . import auth as A
from . import demo as D
from . import exports as X
from . import learning as L
from . import workflow as W
from .challenge import contracts as C
from .challenge import policy as P
from .challenge.playbook import as_dicts
from .challenge.review import ocr_doubt
from .challenge.view import review_view
from .config import Settings, get_settings
from .evals import final_route
from .llm import Provider
from .service import TASK_DOC, run_task
from .tracing import read_trace

_ID = re.compile(r"^[A-Za-z0-9_-]{1,64}$")


def ocr_info(source: dict | None) -> dict | None:
    """How a contract's text was obtained, plus why it cannot be trusted for automatic action."""
    return {**source, "doubt": ocr_doubt(source)} if source else None


class RunRequest(BaseModel):
    task: str
    # Client-chosen id so the UI can poll GET /runs/{id}/trace while the run is in flight.
    run_id: str | None = None


class RunResponse(BaseModel):
    run_id: str
    final_text: str
    route: str | None  # computed by the scoring code from the trace, not the model's own words
    stop_reason: str
    turns: int
    tool_calls: list[str]
    input_tokens: int
    output_tokens: int
    cost_usd: float
    latency_s: float
    model: str


class SignInRequest(BaseModel):
    username: str
    password: str


class DecisionRequest(BaseModel):
    decision: str
    note: str = ""
    message: str | None = None  # optional human-edited message to the counterparty


class ProposalDecision(BaseModel):
    action: str  # accept | reject
    note: str = ""


class ReplayRequest(BaseModel):
    scene_id: str
    speed: float = 3.0  # 1 = recorded pace; higher is faster (gaps are capped at 2 s anyway)


class LabelRequest(BaseModel):
    sensitivity: str
    # Required when the new label is looser than the text calls for: one fixed choice per finding,
    # {group id: choice id} (see GET /contracts label_lowering). No free text. Who signs it off comes
    # from the session, never from the request.
    grounds: dict[str, str] | None = None


class BatchRequest(BaseModel):
    doc_ids: list[str]
    # True: the agent sends negotiate redlines itself; humans only see escalations.
    auto_send: bool = True


def create_app(
    settings: Settings | None = None, provider_factory: Callable[[], Provider] | None = None
) -> FastAPI:
    app = FastAPI(title="Mizan: contract review agent")
    cfg = settings or get_settings()
    locks = W.ReviewLocks()  # one review at a time per contract, shared by single runs and batches
    batches = W.BatchRunner(cfg, provider_factory, locks=locks)
    contract_dirs = cfg.contract_dirs()
    # Runs accepted but not yet traced: polling them answers "starting" instead of 404.
    inflight: set[str] = set()

    def starting(run_id: str) -> bool:
        return run_id in inflight or run_id in batches.pending

    def checked(id_: str) -> str:
        if not _ID.match(id_):
            raise HTTPException(400, "bad id")
        return id_

    # --- sign-in -----------------------------------------------------------------------------------
    auth = A.Auth(A.parse_users(cfg.auth_users), cfg.secret_key, cfg.require_auth)
    roles = P.parse_roles(cfg.auth_roles) if auth.enabled else {}
    public = {"/auth/login", "/auth/logout", "/auth/me", "/healthz", "/", "/index.html"}

    def is_ui_file(path: str) -> bool:
        """Built UI files (scripts, styles, fonts, icons): needed to draw the sign-in page, no data."""
        f = (cfg.web_dir / path.lstrip("/")).resolve()
        return f.is_file() and f.is_relative_to(cfg.web_dir.resolve())

    @app.middleware("http")
    async def require_sign_in(request: Request, call_next):
        path = request.url.path
        open_ = path in public or (request.method == "GET" and is_ui_file(path))
        if auth.enabled and not open_ and auth.user_of(request.cookies.get(A.COOKIE)) is None:
            return JSONResponse({"detail": "sign in required"}, status_code=401)
        return await call_next(request)

    @app.get("/auth/me")
    def me(request: Request) -> dict[str, Any]:
        if not auth.enabled:
            return {"user": None, "auth": False}
        user = auth.user_of(request.cookies.get(A.COOKIE))
        if user is None:
            raise HTTPException(401, "sign in required")
        return {"user": user, "auth": True, "role": P.role_for(roles, user) if roles else None}

    @app.post("/auth/login")
    def login(req: SignInRequest, request: Request) -> Response:
        if not auth.enabled:
            return JSONResponse({"user": None, "auth": False})
        client = request.client.host if request.client else "unknown"
        if auth.blocked(client):
            raise HTTPException(429, "Too many attempts. Wait a few minutes and try again.")
        if not auth.check(client, req.username.strip(), req.password):
            raise HTTPException(401, "That user name and password don't match.")
        res = JSONResponse({"user": req.username.strip(), "auth": True})
        res.set_cookie(
            A.COOKIE,
            auth.token_for(req.username.strip()),
            max_age=A.SESSION_SECONDS,
            httponly=True,
            samesite="lax",
            secure=request.url.scheme == "https",
        )
        return res

    @app.post("/auth/logout")
    def logout() -> Response:
        res = JSONResponse({"ok": True})
        res.delete_cookie(A.COOKIE)
        return res

    @app.get("/healthz")
    def healthz() -> dict[str, Any]:
        from .challenge import ocr

        st = ocr.status()
        return {
            "status": "ok",
            "provider": cfg.provider,
            "model": cfg.model,
            "approve_writes": cfg.approve_writes,
            "ocr": {"available": st["available"], "detail": st["detail"]},
            "data_policy": policy_info(),
            # The review allowance on this deployment (None: no limit).
            "reviews": {"max": cfg.max_reviews, "used": W.reviews_used(cfg)}
            if cfg.max_reviews is not None
            else None,
        }

    def policy_info() -> dict[str, Any]:
        """What the UI needs to say where a contract will go before anyone presses Review."""
        from .llm import build_provider

        try:
            location = P.provider_location(
                provider_factory() if provider_factory else build_provider(cfg), cfg
            )
        except Exception:  # e.g. no API key yet: describe the configured provider, fail closed
            location = cfg.provider_location or (
                P.url_location(cfg.openai_base_url)
                if cfg.provider == "openai_compat"
                else "external"
            )
        return {
            "location": location,
            "max_external": cfg.max_external,
            "redact_external": cfg.redact_external,
            "default_sensitivity": cfg.default_sensitivity,
        }

    def signed_in(request: Request) -> str | None:
        return auth.user_of(request.cookies.get(A.COOKIE)) if auth.enabled else None

    def role(request: Request) -> str:
        return P.role_for(roles, signed_in(request))

    def may_read(request: Request, doc_id: str | None) -> bool:
        return doc_id is None or P.can_read(role(request), P.level_of(cfg, doc_id))

    def guard(request: Request, doc_id: str | None) -> None:
        """Restricted contracts, and every review of one, open only for legal."""
        if not may_read(request, doc_id):
            raise HTTPException(
                403,
                f"{doc_id} is Restricted: only Legal can open it and its reviews. You are signed in "
                f"as {signed_in(request)} ({role(request)}).",
            )

    def run_doc(run_id: str) -> str | None:
        return W.task_doc(cfg.runs_dir / run_id / "trace.jsonl")

    @app.post("/run", response_model=RunResponse)
    def run(req: RunRequest, request: Request) -> RunResponse:  # sync: runs in a worker thread
        if req.run_id is not None:
            checked(req.run_id)
            if (cfg.runs_dir / req.run_id).exists():
                raise HTTPException(409, "run id already used")
        provider = provider_factory() if provider_factory else None
        # One review at a time per contract: a second reviewer gets who has it and since when.
        m = TASK_DOC.search(req.task)
        doc = m.group(1) if m else None
        lock_id = req.run_id or f"anon-{id(req)}"
        guard(request, doc)
        try:
            W.check_quota(cfg, 1, len(inflight) + len(batches.pending))
        except W.QuotaReached as e:
            raise HTTPException(429, str(e)) from None
        if doc:
            try:
                locks.acquire(doc, signed_in(request), lock_id)
            except W.ReviewBusy as e:
                raise HTTPException(409, str(e)) from None
        if req.run_id:
            inflight.add(req.run_id)
        try:
            r = run_task(
                req.task, cfg, provider=provider, run_id=req.run_id, started_by=signed_in(request)
            )
        except Exception as e:  # the model call failed; the trace already records the error
            raise HTTPException(
                502, f"model call failed: {type(e).__name__}: {str(e)[:300]}"
            ) from None
        finally:
            inflight.discard(req.run_id or "")
            if doc:
                locks.release(doc, lock_id)
        return RunResponse(
            run_id=r.run_id,
            final_text=r.final_text,
            route=final_route(read_trace(cfg.runs_dir, r.run_id)),
            stop_reason=r.stop_reason,
            turns=r.turns,
            tool_calls=r.tool_names,
            input_tokens=r.usage.input_tokens,
            output_tokens=r.usage.output_tokens,
            cost_usd=r.cost_usd,
            latency_s=r.latency_s,
            model=r.model,
        )

    @app.get("/runs")
    def runs(request: Request, limit: int = 30, doc_id: str | None = None) -> list[dict[str, Any]]:
        """Newest first. status: running | done | error. needs_human: kind of pending decision.
        `doc_id` keeps only the runs of that contract (read from each run's first event)."""
        base = cfg.runs_dir
        if not base.is_dir():
            return []
        dirs = [d for d in base.iterdir() if (d / "trace.jsonl").is_file()]
        if doc_id is not None:
            checked(doc_id)
            dirs = [d for d in dirs if W.task_doc(d / "trace.jsonl") == doc_id]
        dirs = [d for d in dirs if may_read(request, W.task_doc(d / "trace.jsonl"))]
        dirs.sort(key=lambda d: (d / "trace.jsonl").stat().st_mtime, reverse=True)
        out = []
        for d in dirs[: max(1, min(limit, 100))]:
            st = W.run_state(cfg, d.name)
            tr = read_trace(base, d.name)
            start = next((e for e in tr if e["type"] == "run_start"), {})
            end = st["end"] or {}
            out.append(
                {
                    "run_id": d.name,
                    "task": start.get("task", ""),
                    "model": start.get("model", ""),
                    "doc_id": st["view"]["doc_id"] if st["view"] else None,
                    "route": st["route"],
                    "status": st["status"],
                    "cost_usd": end.get("cost_usd"),
                    "priced": end.get("priced"),
                    "latency_s": end.get("latency_s"),
                    "needs_human": W.pending_kind(st, W.read_decision(cfg, d.name)),
                    "replay_of": start.get("replay_of"),
                    "by": start.get("started_by"),
                    "started": (d / "trace.jsonl").stat().st_ctime,
                }
            )
        return out

    @app.get("/runs/{run_id}/trace")
    def trace(run_id: str, request: Request) -> list[dict]:
        guard(request, run_doc(checked(run_id)))
        try:
            return read_trace(cfg.runs_dir, checked(run_id))
        except FileNotFoundError:
            if starting(run_id):
                return []
            raise HTTPException(404, "unknown run") from None

    @app.get("/runs/{run_id}/review")
    def review(run_id: str, request: Request) -> dict[str, Any]:
        guard(request, run_doc(checked(run_id)))
        st = W.run_state(cfg, run_id)
        if st["status"] == "queued":
            if not starting(run_id):
                raise HTTPException(404, "unknown run")
            return {
                **review_view([]),
                "status": "starting",
                "stats": None,
                "decision": None,
                "pending": None,
                "final_text": "",
            }
        tr = read_trace(cfg.runs_dir, run_id)
        decision = W.read_decision(cfg, run_id)
        return {
            **st["view"],
            "status": st["status"],
            "stats": st["end"],
            "decision": decision,
            "pending": W.pending_kind(st, decision),
            "replay_of": D.is_replay(tr),
            "by": tr[0].get("started_by") if tr else None,
            "final_text": next(
                (e["text"] for e in reversed(tr) if e["type"] == "llm_call" and e["text"]), ""
            ),
        }

    @app.get("/runs/{run_id}/export/{kind}")
    def export(run_id: str, kind: str, request: Request) -> Response:
        """PDF exports: redline.pdf (struck quotes + proposed wording) or memo.pdf."""
        if kind not in ("redline.pdf", "memo.pdf"):
            raise HTTPException(404, "export must be redline.pdf or memo.pdf")
        guard(request, run_doc(checked(run_id)))
        st = W.run_state(cfg, run_id)
        if st["status"] in ("queued", "running") or not st["view"] or not st["view"]["doc_id"]:
            raise HTTPException(404, "no finished review for this run")
        view = {
            **st["view"],
            "decision": W.read_decision(cfg, run_id),
            "model": next(
                (
                    e.get("model")
                    for e in read_trace(cfg.runs_dir, run_id)
                    if e["type"] == "run_start"
                ),
                None,
            ),
        }
        try:
            if kind == "redline.pdf":
                data = X.redline_pdf(cfg, view, run_id)
            else:
                data = X.memo_pdf(cfg, view, run_id)
        except FileNotFoundError:
            raise HTTPException(404, "contract not found") from None
        name = f"{view['doc_id']}-{kind}"
        return Response(
            data,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{name}"'},
        )

    @app.post("/runs/{run_id}/decision")
    def decision(run_id: str, req: DecisionRequest, request: Request) -> dict[str, Any]:
        guard(request, run_doc(checked(run_id)))
        try:
            return W.decide(cfg, checked(run_id), req.decision, req.note, req.message)
        except FileNotFoundError:
            raise HTTPException(404, "unknown run") from None
        except W.InvalidDecision as e:
            raise HTTPException(400, str(e)) from None
        except ValueError as e:  # already decided / not waiting for a human
            raise HTTPException(409, str(e)) from None

    @app.get("/inbox")
    def inbox(request: Request) -> list[dict[str, Any]]:
        return [i for i in W.inbox(cfg) if may_read(request, i["doc_id"])]

    @app.post("/batches")
    def start_batch(req: BatchRequest, request: Request) -> dict[str, Any]:
        for d in req.doc_ids:
            if _ID.match(d):
                guard(request, d)
        try:
            return batches.start(req.doc_ids, req.auto_send, by=signed_in(request))
        except W.ReviewBusy as e:
            raise HTTPException(409, f"{e}. Nothing in this batch was started.") from None
        except W.QuotaReached as e:
            raise HTTPException(429, str(e)) from None
        except FileNotFoundError as e:
            raise HTTPException(404, f"unknown contract: {e}") from None
        except ValueError as e:
            raise HTTPException(400, str(e)) from None

    @app.get("/batches")
    def list_batches() -> list[dict[str, Any]]:
        return batches.list()

    @app.get("/batches/{batch_id}")
    def batch(batch_id: str) -> dict[str, Any]:
        try:
            return batches.status(batch_id)
        except FileNotFoundError:
            raise HTTPException(404, "unknown batch") from None

    @app.get("/contracts")
    def contracts(request: Request) -> list[dict[str, Any]]:
        out = []
        latest = W.latest_reviews(cfg)
        sources = (
            ("sample", cfg.contracts_dir),
            ("held-out", cfg.heldout_dir),
            ("real", cfg.real_dir),
            ("upload", cfg.uploads_dir),
        )
        for source, d in sources:
            if not d.is_dir():
                continue
            for p in sorted([*d.glob("*.md"), *d.glob("*.txt")]):
                if not _ID.match(p.stem):
                    continue
                if not may_read(request, p.stem):
                    # Listed so people know it exists and who to ask; nothing of its text.
                    out.append(
                        {
                            "doc_id": p.stem,
                            "title": "Restricted contract",
                            "clauses": 0,
                            "languages": [],
                            "source": source,
                            "ocr": None,
                            "sensitivity": "restricted",
                            "readable": False,
                            "in_review": None,
                            "last_review": None,
                        }
                    )
                    continue
                c = C.load_contract(d, p.stem)
                out.append(
                    {
                        "doc_id": c.doc_id,
                        "title": c.title,
                        "clauses": len(c.clauses),
                        "languages": sorted({cl.lang for cl in c.clauses}),
                        "source": source,
                        "ocr": ocr_info(c.source),
                        **P.label_info(cfg, c.doc_id),
                        # Who is reviewing it right now (None when nobody is), for the UI's lock.
                        "in_review": locks.holder(c.doc_id),
                        "readable": True,
                        # The newest finished review: open it rather than reviewing again.
                        "last_review": latest.get(c.doc_id),
                    }
                )
        return out

    @app.post("/contracts")
    async def upload_contract(
        request: Request,
        file: UploadFile | None = File(None),
        text: str | None = Form(None),
        title: str | None = Form(None),
    ) -> dict[str, Any]:
        """Upload a .pdf/.docx/.txt/.md file or a scan (.png/.jpg/.tif), or paste text. Scans and
        Arabic PDFs are read by local OCR. Stored under data/uploads (git-ignored). The label is
        always read from the text here; a person changes it afterwards (PUT .../sensitivity)."""
        source: dict | None = None
        try:
            if file is not None and file.filename:
                data = await file.read(C.MAX_UPLOAD_BYTES + 1)
                # OCR takes seconds per page: keep it off the event loop.
                raw, source = await run_in_threadpool(C.extract, file.filename, data)
                name = file.filename
            elif text and text.strip():
                data = text.encode("utf-8")
                raw, name = text, title or "pasted contract"
            else:
                raise ValueError("send a file or paste the contract text")
            hint = (
                title
                or re.sub(r"[_-]+", " ", name.rsplit(".", 1)[0]).strip()
                or "Uploaded contract"
            )
            md = C.to_contract_markdown(raw, hint)
        except ValueError as e:
            raise HTTPException(400, str(e)) from None
        doc_id = C.upload_id(name, data)
        cfg.uploads_dir.mkdir(parents=True, exist_ok=True)
        path = cfg.uploads_dir / f"{doc_id}.md"
        path.write_text(md, encoding="utf-8")
        sidecar = C.source_path(path)
        if source:
            sidecar.write_text(json.dumps(source, ensure_ascii=False), encoding="utf-8")
        else:
            sidecar.unlink(missing_ok=True)
        c = C.load_contract(cfg.uploads_dir, doc_id)
        # Detection runs on this server before the contract can reach any model, and is kept
        # with the label even when a person chooses one, so the audit shows both.
        # The raw text, not the stored one: a marking line is dropped from the clauses.
        found = P.detect_label(f"{title or ''}\n{raw}", c)
        P.write_label(path, found.level, "auto", found)
        return {
            "doc_id": c.doc_id,
            "title": c.title,
            "clauses": len(c.clauses),
            "languages": sorted({cl.lang for cl in c.clauses}),
            "source": "upload",
            "ocr": ocr_info(c.source),
            **P.label_info(cfg, doc_id),
        }

    @app.put("/contracts/{doc_id}/sensitivity")
    def set_label(doc_id: str, req: LabelRequest, request: Request) -> dict[str, Any]:
        """Change an uploaded contract's label, signed off by the signed-in person. Stricter needs
        only a click; looser than the text calls for needs a reason, and the name always comes from
        the session, never from the request, so nobody can sign as someone else."""
        path = P.contract_path(cfg, checked(doc_id))
        if path is None:
            raise HTTPException(404, "unknown contract")
        if path.parent.resolve() != cfg.uploads_dir.resolve():
            raise HTTPException(400, "only uploaded contracts can be relabelled")
        guard(request, doc_id)
        if (h := locks.holder(doc_id)) is not None:
            who = h.get("by") or "someone"
            raise HTTPException(
                409, f"{doc_id} is being reviewed by {who}; change its label once the review ends."
            )
        by = signed_in(request)
        reason = None
        meta = P.read_meta(path)
        detected = meta.get("detected")
        if detected in P.LEVELS and req.sensitivity in P.LEVELS:
            if P.RANK[req.sensitivity] < P.RANK[detected]:
                if not by:
                    raise HTTPException(
                        403,
                        "Sign in to lower a label: the sign-off records who you are."
                        if auth.enabled
                        else "Lowering a label needs a signed-in person, and sign-in is off on "
                        "this server (set HACK_AUTH_USERS).",
                    )
                try:
                    reason = P.check_grounds(meta, req.sensitivity, req.grounds)
                except ValueError as e:
                    raise HTTPException(400, str(e)) from None
        try:
            P.write_label(path, req.sensitivity, "person", by=by, reason=reason)
        except ValueError as e:
            raise HTTPException(400, str(e)) from None
        return {"doc_id": doc_id, **P.label_info(cfg, doc_id)}

    @app.get("/contracts/{doc_id}")
    def contract(doc_id: str, request: Request) -> dict[str, Any]:
        guard(request, checked(doc_id))
        try:
            c = C.load_contract(contract_dirs, doc_id)
        except FileNotFoundError:
            raise HTTPException(404, "unknown contract") from None
        return {
            "doc_id": c.doc_id,
            "title": c.title,
            "clauses": [{"id": cl.id, "lang": cl.lang, "text": cl.text} for cl in c.clauses],
            "ocr": ocr_info(c.source),
            **P.label_info(cfg, c.doc_id),
        }

    @app.get("/demo/scenes")
    def demo_scenes() -> list[dict[str, Any]]:
        return D.scenes(cfg)

    @app.post("/demo/replay")
    def demo_replay(req: ReplayRequest) -> dict[str, Any]:
        """Replay a recorded run as if live: no API key or network needed (demo-safe mode)."""
        try:
            return D.replay(cfg, checked(req.scene_id), req.speed)
        except FileNotFoundError:
            raise HTTPException(404, "unknown scene") from None

    @app.post("/demo/reset")
    def demo_reset() -> dict[str, int]:
        return {"deleted": D.reset(cfg)}

    @app.get("/insights")
    def insights() -> dict[str, Any]:
        """Learning loop: per-rule evidence from lawyers' decisions and proposed amendments."""
        return L.insights(cfg)

    @app.post("/insights/proposals/{proposal_id}")
    def decide_proposal(proposal_id: str, req: ProposalDecision) -> dict[str, Any]:
        try:
            return L.decide_proposal(cfg, proposal_id, req.action, req.note)
        except FileNotFoundError:
            raise HTTPException(404, "unknown or already decided proposal") from None
        except ValueError as e:
            raise HTTPException(400, str(e)) from None

    @app.get("/playbook")
    def playbook() -> list[dict[str, Any]]:
        amended = L.amendments_by_rule(cfg)
        return [{**r, "accepted_by_legal": amended.get(r["id"], [])} for r in as_dicts()]

    @app.get("/evals")
    def evals() -> list[dict[str, Any]]:
        return W.eval_results(cfg)

    @app.get("/{path:path}")
    def index(path: str) -> FileResponse:
        """Built UI files (assets/, favicon...) from inside web/ only, else the single-page app.
        Resolved per request, so the server can start before `npm run build`."""
        f = (cfg.web_dir / path).resolve()
        root = cfg.web_dir.resolve()
        if path and f.is_file() and f.is_relative_to(root):
            # hashed build assets never change; everything else must be revalidated
            immutable = path.startswith("assets/")
            cache = "public, max-age=31536000, immutable" if immutable else "no-cache"
            return FileResponse(f, headers={"Cache-Control": cache})
        if path.startswith("assets/"):
            raise HTTPException(404, "asset not found")  # never answer a script request with HTML
        page = cfg.web_dir / "index.html"
        if not page.is_file():
            raise HTTPException(
                404, "UI not built: run `npm install && npm run build` in frontend/"
            )
        return FileResponse(page, headers={"Cache-Control": "no-cache"})

    return app


app = create_app()
