"""Data policy: which contracts may reach which model, and what is hidden first."""

import json

import pytest
from fastapi.testclient import TestClient

from hack import workflow as W
from hack.api import create_app
from hack.challenge import contracts as C
from hack.challenge import policy as P
from hack.challenge.tools import build_registry
from hack.evals import final_route
from hack.exports import data_line
from hack.llm.fake import FakeProvider
from hack.service import run_task
from hack.tracing import read_trace
from test_contract_review import (
    NDA_TYPES,
    call,
    j,
    read_all,
    route,
    scripted_review,
    tag,
)
from test_workflow import settings


@pytest.mark.parametrize(
    ("url", "where"),
    [
        ("http://localhost:11434/v1", "local"),
        ("http://127.0.0.1:8080/v1", "local"),
        ("http://ollama:11434/v1", "local"),  # a compose service name
        ("http://10.2.3.4/v1", "local"),
        ("http://model.internal/v1", "local"),
        ("https://api.example.com/v1", "external"),
        ("https://8.8.8.8/v1", "external"),
        ("", "external"),
    ],
)
def test_where_a_model_server_runs(url, where):
    assert P.url_location(url) == where


def test_labels_default_by_origin_and_fail_closed(tmp_path):
    s = settings(tmp_path)
    assert P.level_of(s, "nda-en-01") == "public"  # bundled sample
    s.uploads_dir.mkdir(parents=True)
    path = s.uploads_dir / "up-1.md"
    path.write_text("# T\n\nOne clause here.", encoding="utf-8")
    assert P.level_of(s, "up-1") == "internal"  # an upload with no label: the default
    P.write_label(path, "restricted")
    assert P.level_of(s, "up-1") == "restricted"
    P.meta_path(path).write_text("{not json", encoding="utf-8")
    assert P.level_of(s, "up-1") == "restricted"  # a damaged label never loosens the policy
    assert P.level_of(s, "no-such-contract") == "restricted"
    with pytest.raises(ValueError):
        P.write_label(path, "secret")


def test_decision_matrix(tmp_path):
    def d(level, where, **kw):
        return P.decide(settings(tmp_path, sample_sensitivity=level, **kw), "nda-en-01", where)

    assert d("public", "external").allowed and not d("public", "external").redact
    assert d("internal", "external").allowed and d("internal", "external").redact
    assert not d("restricted", "external").allowed
    assert d("restricted", "local").allowed and not d("restricted", "local").redact
    assert not d("internal", "external", max_external="public").allowed
    # even a misconfigured max_external never lets restricted out
    assert not d("restricted", "external", max_external="restricted").allowed
    assert not d("internal", "external", redact_external=False).redact


def test_redaction_hides_identifiers_keeps_amounts_and_restores_exactly():
    text = (
        "Notices to legal@nimbus.example.com or +966 11 234 5678 (mobile 0551234567). Pay to IBAN "
        "SA03 8000 0000 6080 1016 7519, CR 1010123456, VAT 300123456700003. Fees SAR 1,500,000 "
        "within 30 days of 2026-01-01. Al-Noor Legal has reviewed this."
    )
    c = C.Contract(
        "x",
        'Agreement between Nimbus Cloud Ltd ("Supplier") and Al-Noor Logistics Co. ("Customer")',
        [
            C.Clause("c1", "en", text),
            C.Clause("c2", "ar", "بين شركة النور للخدمات اللوجستية («العميل») والمورد"),
        ],
    )
    r = P.Redactor.for_contract(c)
    seen = r.contract(c)
    flat = seen.title + " " + " ".join(cl.text for cl in seen.clauses)
    for secret in (
        "Nimbus Cloud Ltd",
        "Al-Noor",
        "legal@nimbus",
        "234 5678",
        "0551234567",
        "SA03",
        "1010123456",
        "300123456700003",
        "شركة النور",
    ):
        assert secret not in flat, secret
    for kept in ("SAR 1,500,000", "30 days", "2026-01-01", '("Supplier")', "«العميل»"):
        assert kept in flat, kept
    assert [r.restore(cl.text) for cl in seen.clauses] == [cl.text for cl in c.clauses]
    assert r.restore(seen.title) == c.title
    assert r.summary()["PARTY"] >= 3


def test_every_bundled_contract_round_trips_and_leaks_no_party_name():
    s = settings(__import__("pathlib").Path("unused"))
    for d in s.contract_dirs()[:2]:
        for p in sorted(d.glob("*.md")):
            c = C.load_contract(d, p.stem)
            r = P.Redactor.for_contract(c)
            seen = r.contract(c)
            flat = " ".join([seen.title, *(cl.text for cl in seen.clauses)])
            assert not [k for k, v in r.mapping.items() if v.startswith("[PARTY") and k in flat], p
            assert [r.restore(cl.text) for cl in seen.clauses] == [cl.text for cl in c.clauses], p


def test_restricted_contract_never_reaches_an_external_model(tmp_path):
    s = settings(tmp_path, sample_sensitivity="restricted")
    model = FakeProvider([], location="external")  # any call would fail the test
    r = run_task("Review contract saas-en-01 and route it.", s, provider=model, run_id="blk-1")
    assert model.calls == [] and r.stop_reason == "policy" and r.cost_usd == 0
    tr = read_trace(s.runs_dir, "blk-1")
    assert final_route(tr) == "escalate"
    assert not any(e["type"] == "llm_call" for e in tr)
    st = W.run_state(s, "blk-1")
    assert st["status"] == "done" and st["view"]["doc_id"] == "saas-en-01"
    assert "not sent to any model" in st["view"]["reasons"][0]
    (item,) = W.inbox(s)
    assert item["kind"] == "legal_review" and item["run_id"] == "blk-1"


def test_the_tool_gate_holds_even_if_the_run_was_not_checked(tmp_path):
    s = settings(tmp_path, sample_sensitivity="restricted")
    reg = build_registry(s, tmp_path / "run", location="external")
    res = call(reg, "load_contract", doc_id="saas-en-01")
    assert res.is_error and "data policy" in res.content
    assert "Nimbus" not in res.content and "liability" not in res.content.lower()


def test_internal_contract_is_redacted_for_the_model_and_restored_for_people(tmp_path):
    s = settings(tmp_path, sample_sensitivity="internal", approve_writes=True)
    script = scripted_review("services-en-01")
    script[-2] = __import__("hack.llm.fake", fromlist=["call_tools"]).call_tools(
        (
            "5",
            "send_to_counterparty",
            {"doc_id": "services-en-01", "message": "Dear [PARTY-2], amend c3"},
        )
    )
    model = FakeProvider(script, location="external")
    run_task("Review contract services-en-01 and route it.", s, provider=model, run_id="red-1")
    raw = (s.runs_dir / "red-1" / "trace.jsonl").read_text(encoding="utf-8")
    assert "[PARTY-2]" in raw and "Meridian Advisory" not in raw  # what left: placeholders only
    start = read_trace(s.runs_dir, "red-1")[0]
    assert start["data_policy"]["redact"] and start["data_policy"]["redacted"]["PARTY"] == 2
    view = W.run_state(s, "red-1")["view"]
    assert view["route"] == "negotiate"
    assert view["actions"][0]["text"] == "Dear Meridian Advisory FZ-LLC, amend c3"
    outbox = (s.runs_dir / "red-1" / "outbox.jsonl").read_text(encoding="utf-8")
    assert "Dear Meridian Advisory FZ-LLC" in outbox and "[PARTY-2]" not in outbox
    assert "replaced by placeholders" in data_line(view["data_policy"])


def test_restricted_on_a_local_model_never_approves_or_sends_by_itself(tmp_path):
    s = settings(tmp_path, sample_sensitivity="restricted", approve_writes=True)
    reg = build_registry(s, tmp_path / "run", location="local")
    ids = read_all(reg, "nda-en-01")
    assert j(call(reg, "load_contract", doc_id="nda-en-01"))["data_note"] == ""  # no redaction
    tag(reg, "nda-en-01", ids, NDA_TYPES)
    assert route(reg, "nda-en-01") == "escalate"  # would approve if it were not restricted
    reasons = j(call(reg, "score_contract", doc_id="nda-en-01"))["reasons"]
    assert reasons == ["Restricted contract: a lawyer signs off every outcome, even a clean review"]

    model = FakeProvider(scripted_review("services-en-01"), location="local")
    run_task("Review contract services-en-01 and route it.", s, provider=model, run_id="loc-1")
    st = W.run_state(s, "loc-1")
    assert st["route"] == "negotiate" and st["view"]["actions"][0]["dry_run"]
    assert W.pending_kind(st, None) == "approve_send"  # a person sends it, not the agent


def test_api_labels_uploads_and_reports_the_policy(tmp_path):
    client = TestClient(create_app(settings(tmp_path)))
    assert client.get("/healthz").json()["data_policy"]["location"] == "local"  # fake provider
    up = client.post(
        "/contracts",
        data={
            "text": "1. Fees. Net 60.\n\n2. Law. Saudi law.",
            "title": "Small",
            "sensitivity": "restricted",
        },
    )
    assert up.status_code == 200 and up.json()["sensitivity"] == "restricted"
    doc = up.json()["doc_id"]
    listed = {c["doc_id"]: c["sensitivity"] for c in client.get("/contracts").json()}
    assert listed[doc] == "restricted" and listed["nda-en-01"] == "public"
    assert client.put(f"/contracts/{doc}/sensitivity", json={"sensitivity": "internal"}).json() == {
        "doc_id": doc,
        "sensitivity": "internal",
    }
    assert client.get(f"/contracts/{doc}").json()["sensitivity"] == "internal"
    assert client.put(f"/contracts/{doc}/sensitivity", json={"sensitivity": "x"}).status_code == 400
    assert (
        client.put("/contracts/nda-en-01/sensitivity", json={"sensitivity": "public"}).status_code
        == 400
    )
    bad = client.post("/contracts", data={"text": "1. Fees. Net 60.", "sensitivity": "secret"})
    assert bad.status_code == 400
    plain = client.post("/contracts", data={"text": "1. Other text. Net 90.\n\n2. More."})
    assert plain.json()["sensitivity"] == "internal"  # the default when none is chosen
    assert json.loads(P.meta_path(tmp_path / "uploads" / f"{doc}.md").read_text())["sensitivity"]
