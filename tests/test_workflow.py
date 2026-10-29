import io
import json

import pytest
from fastapi.testclient import TestClient

from hack import workflow as W
from hack.api import create_app
from hack.challenge import contracts as C
from hack.config import Settings
from hack.llm.fake import FakeProvider, call_tools, text
from test_contract_review import GOV, LIAB, scripted_review


def settings(tmp_path, **kw) -> Settings:
    return Settings(
        provider="fake",
        runs_dir=tmp_path / "runs",
        web_dir=tmp_path / "web",
        uploads_dir=tmp_path / "uploads",
        results_dir=tmp_path / "results",
        proof_dir=tmp_path / "proof",
        **kw,
    )


def scripted_escalation(doc="nda-en-01"):
    """Maps every clause as Other: no liability/governing-law clause declared -> escalate."""
    ids = [f"c{i}" for i in range(1, 8)]
    return [
        call_tools(("1", "load_contract", {"doc_id": doc})),
        call_tools(
            (
                "2",
                "submit_clause_map",
                {
                    "doc_id": doc,
                    "clauses": [{"clause_id": i, "clause_types": ["Other"]} for i in ids],
                },
            )
        ),
        call_tools(("3", "score_contract", {"doc_id": doc})),
        call_tools(
            ("4", "escalate_to_legal", {"doc_id": doc, "question": "Which clause caps liability?"})
        ),
        text("ROUTE: escalate"),
    ]


# --- upload / ingest ---------------------------------------------------------------------------


def test_pdf_style_text_is_regrouped_into_clauses():
    raw = "SERVICE AGREEMENT\n1. Services. The supplier\nshall provide services.\n2. Fees. Net 30.\n3. Law. Saudi law."
    md = C.to_contract_markdown(raw, "hint")
    title, clauses = C.split_clauses(md)
    assert title == "SERVICE AGREEMENT"
    assert [c.text for c in clauses] == [
        "1. Services. The supplier shall provide services.",
        "2. Fees. Net 30.",
        "3. Law. Saudi law.",
    ]
    ar = "عقد خدمات\nالمادة 1: الخدمات يقدمها المورد.\nالمادة 2: يخضع العقد لأنظمة المملكة."
    assert len(C.split_clauses(C.to_contract_markdown(ar, "x"))[1]) == 2


def test_extract_text_docx_and_rejections():
    from docx import Document

    doc = Document()
    doc.add_paragraph("Supply Agreement")
    doc.add_paragraph("1. Supply. The supplier delivers goods monthly.")
    doc.add_paragraph("2. Liability. Each party's liability is capped at fees paid in 12 months.")
    buf = io.BytesIO()
    doc.save(buf)
    raw = C.extract_text("supply.docx", buf.getvalue())
    title, clauses = C.split_clauses(C.to_contract_markdown(raw, "x"))
    assert title == "Supply Agreement" and len(clauses) == 2
    with pytest.raises(ValueError, match="unsupported"):
        C.extract_text("x.exe", b"MZ")
    with pytest.raises(ValueError, match="empty"):
        C.to_contract_markdown("   ", "x")
    with pytest.raises(ValueError, match="too large"):
        C.extract_text("x.txt", b"a" * (C.MAX_UPLOAD_BYTES + 1))
    assert C.extract_text("x.txt", "عقد".encode("cp1256")) == "عقد"  # legacy Arabic encoding


def test_upload_endpoint_then_review_the_uploaded_contract(tmp_path):
    s = settings(tmp_path)
    client = TestClient(create_app(s))
    pasted = (
        "My NDA\n\n1. Confidentiality lasts four years.\n\n2. Saudi law governs this agreement."
    )
    r = client.post("/contracts", data={"text": pasted})
    assert r.status_code == 200, r.text
    doc = r.json()
    assert doc["source"] == "upload" and doc["clauses"] == 2 and doc["title"] == "My NDA"
    assert (s.uploads_dir / f"{doc['doc_id']}.md").is_file()
    listed = {d["doc_id"]: d["source"] for d in client.get("/contracts").json()}
    assert listed[doc["doc_id"]] == "upload" and listed["nda-en-01"] == "sample"
    assert client.get(f"/contracts/{doc['doc_id']}").json()["clauses"][1]["id"] == "c2"
    assert client.post("/contracts", data={"text": "  "}).status_code == 400
    bad = client.post("/contracts", files={"file": ("x.exe", b"MZ", "application/octet-stream")})
    assert bad.status_code == 400
    # the agent's tools find uploaded contracts too
    from hack.challenge.tools import build_registry
    from hack.llm.base import ToolCall

    res = build_registry(s).execute(ToolCall("x", "load_contract", {"doc_id": doc["doc_id"]}))
    assert not res.is_error and json.loads(res.content)["clause_count"] == 2


# --- batch, inbox, decisions -------------------------------------------------------------------


def run_batch(s, script_fn, docs, auto_send):
    runner = W.BatchRunner(s, provider_factory=lambda: FakeProvider(script_fn()), workers=2)
    manifest = runner.start(docs, auto_send=auto_send)
    runner.pool.shutdown(wait=True)
    return runner, runner.status(manifest["batch_id"])


def test_batch_with_human_approval_of_sends(tmp_path):
    s = settings(tmp_path)
    _, st = run_batch(s, lambda: scripted_review("services-en-01"), ["services-en-01"] * 2, False)
    assert st["done"] == 2 and st["routes"]["negotiate"] == 2 and st["errors"] == 0
    assert st["needs_human"] == 2 and all(i["pending"] == "approve_send" for i in st["items"])
    assert st["estimate"]["hours_saved"] == 2.0 and "60 min" in st["estimate"]["assumptions"]
    items = W.inbox(s)
    assert {i["kind"] for i in items} == {"approve_send"} and len(items) == 2
    rid = items[0]["run_id"]
    with pytest.raises(ValueError, match="must be one of"):
        W.decide(s, rid, "approve_contract")
    rec = W.decide(s, rid, "send", note="ok")
    assert rec["message"] == "amend c3"
    out = [json.loads(x) for x in (s.runs_dir / rid / "outbox.jsonl").read_text().splitlines()]
    assert out[-1]["by"] == "human" and out[-1]["kind"] == "counterparty"
    with pytest.raises(ValueError, match="already decided"):
        W.decide(s, rid, "send")
    assert len(W.inbox(s)) == 1


def test_batch_auto_send_needs_no_human_and_escalations_reach_legal(tmp_path):
    s = settings(tmp_path)
    _, st = run_batch(s, lambda: scripted_review("services-en-01"), ["services-en-01"], True)
    assert st["needs_human"] == 0 and st["items"][0]["sent"] is True
    _, st = run_batch(s, scripted_escalation, ["nda-en-01"], True)
    assert st["routes"]["escalate"] == 1 and st["items"][0]["pending"] == "legal_review"
    assert st["estimate"]["human_hours_with_agent"] == 0.25
    legal = [i for i in W.inbox(s) if i["kind"] == "legal_review"]
    assert len(legal) == 1 and "missing" in legal[0]["reasons"][0]
    rec = W.decide(s, legal[0]["run_id"], "request_changes")
    assert rec["message"].startswith("Requested changes to nda-en-01")


def test_batch_rejects_unknown_or_unsafe_docs(tmp_path):
    runner = W.BatchRunner(settings(tmp_path))
    with pytest.raises(FileNotFoundError):
        runner.start(["nope"], True)
    with pytest.raises(ValueError):
        runner.start(["../x"], True)
    with pytest.raises(ValueError):
        runner.start([], True)
    with pytest.raises(FileNotFoundError):
        runner.status("../../etc")


def test_failed_run_is_closed_not_running_forever(tmp_path):
    s = settings(tmp_path)

    def boom(_messages):
        raise RuntimeError("provider down")

    runner, st = run_batch(s, lambda: [boom], ["nda-en-01"], True)
    assert st["errors"] == 1 and st["items"][0]["status"] == "error"


def test_eval_results_pick_the_most_complete_run_per_model(tmp_path):
    s = settings(tmp_path)
    s.results_dir.mkdir()

    def write(name, model, ids):
        cases = [
            {"id": i, "passed": True, "expected_route": "approve", "got_route": "approve"}
            for i in ids
        ]
        summary = {"model": model, "route_accuracy": 1.0, "cases": len(ids)}
        (s.results_dir / name).write_text(json.dumps({"summary": summary, "cases": cases}))

    write("a.json", "m1", ["nda-en-01"])
    write("b.json", "m1", ["nda-en-01", "saas-en-01"])
    write("c.json", "m2", ["calc-1"])  # not the contract suite: ignored
    res = W.eval_results(s)
    assert [(r["model"], r["file"]) for r in res] == [("m1", "b.json")]


def test_api_workflow_endpoints(tmp_path):
    s = settings(tmp_path)
    client = TestClient(create_app(s, provider_factory=lambda: FakeProvider(scripted_escalation())))
    b = client.post("/batches", json={"doc_ids": ["nda-en-01"], "auto_send": False})
    assert b.status_code == 200
    assert client.post("/batches", json={"doc_ids": ["nope"]}).status_code == 404
    assert client.get("/batches/zzz").status_code == 404
    assert client.get("/evals").json() == []
    assert client.get("/runs/x/review").status_code == 404
    assert client.post("/runs/nope/decision", json={"decision": "send"}).status_code == 404
    assert client.get("/healthz").json()["approve_writes"] is False
    assert LIAB and GOV  # shared constants imported for parity with the contract tests


def test_junk_text_is_not_a_contract_and_eval_runs_never_pend(tmp_path):
    with pytest.raises(ValueError, match="fewer than 2 clauses"):
        C.to_contract_markdown("Title\n\n---\n\n... ---", "x")
    s = settings(tmp_path)
    runner, st = run_batch(s, lambda: scripted_review("services-en-01"), ["services-en-01"], False)
    assert st["priced"] is False  # the fake model has no price
    rid = st["items"][0]["run_id"]
    assert W.pending_kind(W.run_state(s, rid), None) == "approve_send"
    eval_state = {**W.run_state(s, rid), "run_id": "eval-x-1"}
    assert W.pending_kind(eval_state, None) is None


def test_static_catch_all_never_serves_files_outside_web_root(tmp_path):
    s = settings(tmp_path)
    s.web_dir.mkdir(parents=True)
    (s.web_dir / "index.html").write_text("<html>app</html>")
    (s.web_dir / "favicon.svg").write_text("<svg/>")
    (tmp_path / "secret.txt").write_text("TOP SECRET")
    client = TestClient(create_app(s))
    assert client.get("/favicon.svg").text == "<svg/>"
    for p in (
        "/..%2Fsecret.txt",
        "/../secret.txt",
        "/%2e%2e/secret.txt",
        "/assets/..%2F..%2Fsecret.txt",
    ):
        r = client.get(p)
        assert "TOP SECRET" not in r.text, p
    assert client.get("/some/spa/route").text == "<html>app</html>"


def test_missing_asset_is_404_not_html(tmp_path):
    s = settings(tmp_path)
    s.web_dir.mkdir(parents=True)
    (s.web_dir / "index.html").write_text("<html>app</html>")
    client = TestClient(create_app(s))
    assert client.get("/assets/old-build.js").status_code == 404


def test_corrupt_uploads_are_400_and_invalid_decisions_400(tmp_path):
    with pytest.raises(ValueError, match="could not be read"):
        C.extract_text("x.docx", b"not a zip")
    with pytest.raises(ValueError, match="could not be read"):
        C.extract_text("x.pdf", b"%PDF-1.4 garbage")
    s = settings(tmp_path)
    client = TestClient(create_app(s))
    r = client.post("/contracts", files={"file": ("x.pdf", b"%PDF-1.4 garbage", "application/pdf")})
    assert r.status_code == 400 and "could not be read" in r.json()["detail"]
    _, st = run_batch(s, lambda: scripted_review("services-en-01"), ["services-en-01"], False)
    rid = st["items"][0]["run_id"]
    assert client.post(f"/runs/{rid}/decision", json={"decision": "nonsense"}).status_code == 400
    assert client.post(f"/runs/{rid}/decision", json={"decision": "send"}).status_code == 200
    assert client.post(f"/runs/{rid}/decision", json={"decision": "send"}).status_code == 409


def test_polling_a_run_that_has_not_started_yet_is_not_404(tmp_path):
    import threading

    s = settings(tmp_path)
    gate = threading.Event()

    def slow(_messages):
        gate.wait(5)
        return text("done")

    app = create_app(s, provider_factory=lambda: FakeProvider([slow]))
    client = TestClient(app)
    t = threading.Thread(
        target=lambda: client.post("/run", json={"task": "x", "run_id": "ui-slow-1"})
    )
    t.start()
    try:
        import time as _t

        for _ in range(50):  # until the request is in flight
            r = client.get("/runs/ui-slow-1/review")
            if r.status_code == 200:
                break
            _t.sleep(0.05)
        assert r.status_code == 200 and r.json()["status"] in ("starting", "running")
        assert client.get("/runs/ui-slow-1/trace").status_code == 200
        assert client.get("/runs/never-started/review").status_code == 404
    finally:
        gate.set()
        t.join()


def test_proof_prefers_curated_files_and_keeps_variants_apart(tmp_path):
    s = settings(tmp_path)
    for d in (s.results_dir, s.proof_dir):
        d.mkdir()

    def write(folder, name, model, variant=None, acc=1.0):
        summary = {"model": model, "route_accuracy": acc, "cases": 1}
        if variant:
            summary["variant"] = variant
        cases = [{"id": "nda-en-01", "passed": True}]
        (folder / name).write_text(json.dumps({"summary": summary, "cases": cases}))

    write(s.results_dir, "local.json", "scratch-model")
    assert [r["model"] for r in W.eval_results(s)] == ["scratch-model"]  # no proof yet: fallback
    write(s.proof_dir, "a.json", "m", acc=0.75)
    write(s.proof_dir, "b.json", "m", variant="before red-flag tripwires", acc=0.58)
    res = W.eval_results(s)
    assert [(r["model"], r["variant"]) for r in res] == [
        ("m", None),
        ("m", "before red-flag tripwires"),
    ]


def stops_after_scoring(doc="services-en-01"):
    """Scores to negotiate, then quits without render/send; a second stop after the nudge."""
    full = scripted_review(doc)
    return [*full[:4], text("done, I think"), text("still done")]


def test_model_that_stops_early_is_nudged_to_finish(tmp_path):
    s = settings(tmp_path)
    script = [
        *scripted_review("services-en-01")[:4],
        text("done, I think"),
        *scripted_review("services-en-01")[4:],
    ]
    from hack.service import run_task

    r = run_task("Review contract services-en-01 and route it.", s, provider=FakeProvider(script))
    tr = [json.loads(x) for x in (s.runs_dir / r.run_id / "trace.jsonl").read_text().splitlines()]
    nudges = [e for e in tr if e["type"] == "nudge"]
    assert len(nudges) == 1 and "send_to_counterparty" in nudges[0]["text"]
    assert "send_to_counterparty" in r.tool_names  # it finished after the nudge


def test_nudges_are_bounded_and_the_workflow_owns_the_follow_up(tmp_path):
    s = settings(tmp_path)
    # human mode: the model never sends -> the run still lands in the inbox with a composed draft
    _, st = run_batch(s, stops_after_scoring, ["services-en-01"], False)
    item = st["items"][0]
    assert item["route"] == "negotiate" and item["pending"] == "approve_send"
    tr = [
        json.loads(x)
        for x in (s.runs_dir / item["run_id"] / "trace.jsonl").read_text().splitlines()
    ]
    assert len([e for e in tr if e["type"] == "nudge"]) == 2  # MAX_NUDGES, then it gives up
    inbox_item = next(i for i in W.inbox(s) if i["run_id"] == item["run_id"])
    assert inbox_item["agent_text"].startswith("Requested changes to services-en-01")
    # auto-send mode: the workflow sends the composed redline itself and says so
    s2 = settings(tmp_path / "auto")
    _, st2 = run_batch(s2, stops_after_scoring, ["services-en-01"], True)
    it2 = st2["items"][0]
    assert it2["pending"] is None and it2["decision"] == "send" and st2["needs_human"] == 0
    assert it2["decided_by"] == "workflow (auto-send policy)"
    rec = W.read_decision(s2, it2["run_id"])
    assert rec["by"] == "workflow (auto-send policy)" and "Requested changes" in rec["message"]
