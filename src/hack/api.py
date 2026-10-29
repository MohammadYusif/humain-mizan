from __future__ import annotations

import re
from collections.abc import Callable
from typing import Any

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel

from . import workflow as W
from .challenge import contracts as C
from .challenge.playbook import as_dicts
from .challenge.view import review_view
from .config import Settings, get_settings
from .evals import final_route
from .llm import Provider
from .service import run_task
from .tracing import read_trace

_ID = re.compile(r"^[A-Za-z0-9_-]{1,64}$")


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


class DecisionRequest(BaseModel):
    decision: str
    note: str = ""
    message: str | None = None  # optional human-edited message to the counterparty


class BatchRequest(BaseModel):
    doc_ids: list[str]
    # True: the agent sends negotiate redlines itself; humans only see escalations.
    auto_send: bool = True


def create_app(
    settings: Settings | None = None, provider_factory: Callable[[], Provider] | None = None
) -> FastAPI:
    app = FastAPI(title="Mizan: contract review agent")
    cfg = settings or get_settings()
    batches = W.BatchRunner(cfg, provider_factory)
    contract_dirs = [cfg.contracts_dir, cfg.uploads_dir]
    # Runs accepted but not yet traced: polling them answers "starting" instead of 404.
    inflight: set[str] = set()

    def starting(run_id: str) -> bool:
        return run_id in inflight or run_id in batches.pending

    def checked(id_: str) -> str:
        if not _ID.match(id_):
            raise HTTPException(400, "bad id")
        return id_

    @app.get("/healthz")
    def healthz() -> dict[str, Any]:
        return {
            "status": "ok",
            "provider": cfg.provider,
            "model": cfg.model,
            "approve_writes": cfg.approve_writes,
        }

    @app.post("/run", response_model=RunResponse)
    def run(req: RunRequest) -> RunResponse:  # sync def: FastAPI runs it in a worker thread
        if req.run_id is not None:
            checked(req.run_id)
            if (cfg.runs_dir / req.run_id).exists():
                raise HTTPException(409, "run id already used")
        provider = provider_factory() if provider_factory else None
        if req.run_id:
            inflight.add(req.run_id)
        try:
            r = run_task(req.task, cfg, provider=provider, run_id=req.run_id)
        finally:
            inflight.discard(req.run_id or "")
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
    def runs(limit: int = 30) -> list[dict[str, Any]]:
        """Newest first. status: running | done | error. needs_human: kind of pending decision."""
        base = cfg.runs_dir
        if not base.is_dir():
            return []
        dirs = [d for d in base.iterdir() if (d / "trace.jsonl").is_file()]
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
                    "started": (d / "trace.jsonl").stat().st_ctime,
                }
            )
        return out

    @app.get("/runs/{run_id}/trace")
    def trace(run_id: str) -> list[dict]:
        try:
            return read_trace(cfg.runs_dir, checked(run_id))
        except FileNotFoundError:
            if starting(run_id):
                return []
            raise HTTPException(404, "unknown run") from None

    @app.get("/runs/{run_id}/review")
    def review(run_id: str) -> dict[str, Any]:
        st = W.run_state(cfg, checked(run_id))
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
            "final_text": next(
                (e["text"] for e in reversed(tr) if e["type"] == "llm_call" and e["text"]), ""
            ),
        }

    @app.post("/runs/{run_id}/decision")
    def decision(run_id: str, req: DecisionRequest) -> dict[str, Any]:
        try:
            return W.decide(cfg, checked(run_id), req.decision, req.note, req.message)
        except FileNotFoundError:
            raise HTTPException(404, "unknown run") from None
        except W.InvalidDecision as e:
            raise HTTPException(400, str(e)) from None
        except ValueError as e:  # already decided / not waiting for a human
            raise HTTPException(409, str(e)) from None

    @app.get("/inbox")
    def inbox() -> list[dict[str, Any]]:
        return W.inbox(cfg)

    @app.post("/batches")
    def start_batch(req: BatchRequest) -> dict[str, Any]:
        try:
            return batches.start(req.doc_ids, req.auto_send)
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
    def contracts() -> list[dict[str, Any]]:
        out = []
        for source, d in (("sample", cfg.contracts_dir), ("upload", cfg.uploads_dir)):
            if not d.is_dir():
                continue
            for p in sorted([*d.glob("*.md"), *d.glob("*.txt")]):
                if not _ID.match(p.stem):
                    continue
                c = C.load_contract(d, p.stem)
                out.append(
                    {
                        "doc_id": c.doc_id,
                        "title": c.title,
                        "clauses": len(c.clauses),
                        "languages": sorted({cl.lang for cl in c.clauses}),
                        "source": source,
                    }
                )
        return out

    @app.post("/contracts")
    async def upload_contract(
        file: UploadFile | None = File(None),
        text: str | None = Form(None),
        title: str | None = Form(None),
    ) -> dict[str, Any]:
        """Upload a .txt/.md/.docx/.pdf file, or paste text. Stored under data/uploads (git-ignored)."""
        try:
            if file is not None and file.filename:
                data = await file.read(C.MAX_UPLOAD_BYTES + 1)
                raw, name = C.extract_text(file.filename, data), file.filename
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
        (cfg.uploads_dir / f"{doc_id}.md").write_text(md, encoding="utf-8")
        c = C.load_contract(cfg.uploads_dir, doc_id)
        return {
            "doc_id": c.doc_id,
            "title": c.title,
            "clauses": len(c.clauses),
            "languages": sorted({cl.lang for cl in c.clauses}),
            "source": "upload",
        }

    @app.get("/contracts/{doc_id}")
    def contract(doc_id: str) -> dict[str, Any]:
        try:
            c = C.load_contract(contract_dirs, checked(doc_id))
        except FileNotFoundError:
            raise HTTPException(404, "unknown contract") from None
        return {
            "doc_id": c.doc_id,
            "title": c.title,
            "clauses": [{"id": cl.id, "lang": cl.lang, "text": cl.text} for cl in c.clauses],
        }

    @app.get("/playbook")
    def playbook() -> list[dict[str, Any]]:
        return as_dicts()

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
            return FileResponse(f)
        if path.startswith("assets/"):
            raise HTTPException(404, "asset not found")  # never answer a script request with HTML
        page = cfg.web_dir / "index.html"
        if not page.is_file():
            raise HTTPException(
                404, "UI not built: run `npm install && npm run build` in frontend/"
            )
        return FileResponse(page)

    return app


app = create_app()
