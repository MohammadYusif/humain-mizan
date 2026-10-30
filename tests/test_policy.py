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


def test_a_place_before_a_role_is_not_taken_for_a_party():
    """'registered in Riyadh ("Supplier")' names a place; hiding it would also hide the city in
    the governing-law clause, which the review needs."""
    c = C.Contract(
        "x",
        "Logistics Services Agreement",
        [
            C.Clause(
                "c1",
                "en",
                'Between Wadi Freight Co., a company registered in Riyadh (the "Supplier"), and '
                'Ramla Retail Co., a company registered in Jeddah (the "Customer").',
            ),
            C.Clause("c2", "en", "The courts of Riyadh have jurisdiction over any dispute."),
        ],
    )
    r = P.Redactor.for_contract(c)
    seen = " ".join(cl.text for cl in r.contract(c).clauses)
    assert "Wadi Freight Co." not in seen and "Ramla Retail Co." not in seen
    assert "courts of Riyadh" in seen and "registered in Jeddah" in seen
    assert r.summary()["PARTY"] == 2


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
    # The message is built by code from the redline, with the real names put back; the model's
    # own wording ("Dear [PARTY-2], amend c3") is not what leaves.
    sent = view["actions"][0]["text"]
    assert sent.startswith("Requested changes to Consulting Services Agreement")
    assert "Meridian Advisory FZ-LLC" in sent and "\n1. Clause 3 (Termination): " in sent
    outbox = (s.runs_dir / "red-1" / "outbox.jsonl").read_text(encoding="utf-8")
    assert "Meridian Advisory FZ-LLC" in outbox and "[PARTY-" not in outbox
    assert "amend c3" not in outbox
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
    # The upload never takes a label: Mizan reads the text, and a person changes it afterwards.
    up = client.post(
        "/contracts",
        data={
            "text": "1. Fees. Net 60.\n\n2. Law. Saudi law.",
            "title": "Small",
            "sensitivity": "public",
        },
    )
    assert up.status_code == 200 and up.json()["sensitivity"] == "internal"
    assert up.json()["label_set_by"] == "auto"
    doc = up.json()["doc_id"]
    raised = client.put(f"/contracts/{doc}/sensitivity", json={"sensitivity": "restricted"})
    assert raised.json()["sensitivity"] == "restricted"  # stricter: one click, no sign-off
    listed = {c["doc_id"]: c["sensitivity"] for c in client.get("/contracts").json()}
    assert listed[doc] == "restricted" and listed["nda-en-01"] == "public"
    relabelled = client.put(f"/contracts/{doc}/sensitivity", json={"sensitivity": "internal"})
    assert relabelled.json()["sensitivity"] == "internal"
    assert relabelled.json()["label_set_by"] == "person"
    assert client.get(f"/contracts/{doc}").json()["sensitivity"] == "internal"
    assert client.put(f"/contracts/{doc}/sensitivity", json={"sensitivity": "x"}).status_code == 400
    assert (
        client.put("/contracts/nda-en-01/sensitivity", json={"sensitivity": "public"}).status_code
        == 400
    )
    plain = client.post("/contracts", data={"text": "1. Other text. Net 90.\n\n2. More."})
    assert plain.json()["sensitivity"] == "internal"  # detected: nothing shows it is published
    assert plain.json()["label_set_by"] == "auto"
    assert json.loads(P.meta_path(tmp_path / "uploads" / f"{doc}.md").read_text())["sensitivity"]


def _contract(text: str, title: str = "Agreement") -> C.Contract:
    return C.Contract("x", title, [C.Clause("c1", "en", text)])


@pytest.mark.parametrize(
    ("text", "level", "reason"),
    [
        (
            "STRICTLY CONFIDENTIAL\n\n1. Fees. Net 60.",
            "restricted",
            "Marked “Strictly confidential”",
        ),
        ("**CONFIDENTIAL**\n\n1. Fees. Net 60.", "restricted", "Marked “Confidential”"),
        ("سري للغاية\n\n١. الرسوم خلال ستين يوماً.", "restricted", "Marked «سري للغاية»"),
        ("Classification: Restricted\n\n1. Fees.", "restricted", "Classified “Restricted”"),
        ("التصنيف: سري\n\n١. الرسوم.", "restricted", "Classified «سري»"),
        (
            "This document is shared under the mutual non-disclosure agreement dated 1 May.",
            "restricted",
            "Shared under a non-disclosure agreement",
        ),
        (
            "The Hospital will record each patient's name and medical record number.",
            "restricted",
            "Mentions sensitive personal data (health records)",
        ),
        ("يلتزم المورد بحماية البيانات الصحية للمرضى.", "restricted", "health records"),
        ("Pay by card 4111 1111 1111 1111 on delivery.", "restricted", "Has a payment card number"),
        ("For internal use only\n\n1. Fees. Net 60.", "internal", "Marked “For internal use only”"),
        (
            'Between Nimbus Cloud Ltd ("Supplier") and the Customer. IBAN SA03 8000 0000 6080 1016 7519.',
            "internal",
            "Has 1 party name and 1 IBAN",
        ),
        (
            "This Agreement is made between [Insert name of Supplier] and ____________.",
            "public",
            "A blank template",
        ),
        (
            "1. Fees. Net 60.\n\n2. Law. Saudi law.",
            "internal",
            "nothing shows the text is published",
        ),
    ],
)
def test_label_detection(text, level, reason):
    found = P.detect_label(text, _contract(text))
    assert found.level == level, found
    assert any(reason in r for r in found.reasons), found.reasons


@pytest.mark.parametrize(
    "text",
    [
        "## Confidential Information\n\nEach party shall keep the other's Confidential Information secret.",
        "## 9. Confidentiality\n\nThe Receiving Party shall not disclose information under this Agreement.",
        "Information disclosed under the confidentiality obligations in clause 9 stays protected.",
        "Document No. 220239503652 790-7",  # a reference number that passes the card checksum
        "VAT 300123456700003, CR 1010123456.",
    ],
)
def test_ordinary_contract_language_is_not_restricted(text):
    assert P.detect_label(text, _contract(text)).level != "restricted"


def test_uploads_are_labelled_from_their_text_and_a_person_can_override(tmp_path):
    client = TestClient(create_app(settings(tmp_path)))
    text = "STRICTLY CONFIDENTIAL\n\nSupply agreement\n\n1. Fees. Net 60.\n\n2. Law. Saudi law."
    up = client.post("/contracts", data={"text": text}).json()
    assert up["sensitivity"] == "restricted" and up["label_set_by"] == "auto"
    assert up["label_reasons"] == ["Marked “Strictly confidential”"]
    assert up["title"] == "Supply agreement" and up["clauses"] == 2  # the marking is neither
    assert {"kind": "Marking", "text": "STRICTLY CONFIDENTIAL", "level": "restricted"} in up[
        "label_evidence"
    ]
    named = client.post(
        "/contracts",
        data={
            "text": 'Between Nimbus Cloud Ltd ("Supplier") and the Customer.\n\n'
            "1. Pay to IBAN SA03 8000 0000 6080 1016 7519.\n\n2. Card 4111 1111 1111 1111."
        },
    ).json()
    shown = {(e["kind"], e["text"]) for e in named["label_evidence"]}
    assert ("Party name", "Nimbus Cloud Ltd") in shown
    assert ("IBAN", "SA03 8000 0000 6080 1016 7519") in shown
    assert ("Payment card number", "•••• 1111") in shown  # masked, never shown in full
    doc = up["doc_id"]
    url = f"/contracts/{doc}/sensitivity"
    # Sign-in off: nobody can lower a label, whatever name the request claims.
    off = client.put(
        url, json={"sensitivity": "internal", "grounds": {"marking": "nda-ended"}, "by": "Sara"}
    )
    assert off.status_code == 403
    signed_off_lowering_needs_a_signed_in_person(tmp_path, text)


def signed_off_lowering_needs_a_signed_in_person(tmp_path, text):
    """With sign-in on, the sign-off name is the session's account: a name in the request is
    ignored, so nobody can sign as someone else."""
    from hack.auth import hash_password

    users = f"sara:{hash_password('sara-test-password')},omar:{hash_password('omar-test-password')}"
    s = settings(tmp_path / "auth", auth_users=users, secret_key="test-secret")
    client = TestClient(create_app(s))
    assert (
        client.post(
            "/auth/login", json={"username": "sara", "password": "sara-test-password"}
        ).status_code
        == 200
    )
    doc = client.post("/contracts", data={"text": text}).json()["doc_id"]
    url = f"/contracts/{doc}/sensitivity"
    # Looser than the text calls for: one fixed answer per finding, never free text.
    listed = {c["doc_id"]: c for c in client.get("/contracts").json()}
    asks = listed[doc]["label_lowering"]["internal"]
    assert [g["id"] for g in asks] == ["marking"]
    assert asks[0]["found"] == ["STRICTLY CONFIDENTIAL"]
    assert client.put(url, json={"sensitivity": "internal"}).status_code == 400
    typed = client.put(url, json={"sensitivity": "internal", "reason": "asdf"})
    assert typed.status_code == 400  # a typed reason is not an answer
    made_up = client.put(url, json={"sensitivity": "internal", "grounds": {"marking": "asdf"}})
    assert made_up.status_code == 400 and "not one of the choices" in made_up.text.lower()
    changed = client.put(
        url,
        json={"sensitivity": "internal", "grounds": {"marking": "marking-released"}, "by": "omar"},
    ).json()
    assert changed["sensitivity"] == "internal" and changed["label_set_by"] == "person"
    assert changed["label_detected"] == "restricted"  # what the text said is kept for the audit
    assert changed["label_set_by_name"] == "sara"  # the session, not the claimed "omar"
    assert changed["label_change_reason"] == (
        "Its classification marking: the owner has since released it at this level"
    )
    assert changed["label_set_at"]
    # Lower again to Public: the party names now need an answer as well as the marking.
    to_public = changed["label_lowering"]["public"]
    assert {g["id"] for g in to_public} == {"marking"}  # this text has no names or numbers
    # Stricter needs only the click; the change is still recorded with the account.
    raised = client.put(url, json={"sensitivity": "restricted"}).json()
    assert raised["sensitivity"] == "restricted" and raised["label_change_reason"] is None
    assert raised["label_set_by_name"] == "sara"
    # Signed out: lowering is refused.
    client.post("/auth/logout")
    client.cookies.clear()
    signed_out = client.put(
        url, json={"sensitivity": "internal", "grounds": {"marking": "marking-released"}}
    )
    assert signed_out.status_code == 401
    signed = data_line(
        {
            "sensitivity": "internal",
            "allowed": True,
            "location": "external",
            "label_set_by": "person",
            "label_detected": "restricted",
            "label_reasons": ["Marked “Strictly confidential”"],
            "label_set_by_name": "Sara Ahmed",
            "label_set_at": "2026-10-30T18:00:00+00:00",
            "label_change_reason": "NDA ended on 1 Oct",
        }
    )
    assert signed.startswith(
        "Detected: Restricted (marked “Strictly confidential”). Set to Internal by Sara Ahmed on "
        "30 Oct 2026, reason: NDA ended on 1 Oct."
    )
    client.post("/auth/login", json={"username": "sara", "password": "sara-test-password"})
    listed = {c["doc_id"]: c for c in client.get("/contracts").json()}
    assert listed[doc]["label_set_by"] == "person" and listed["nda-en-01"]["label_set_by"] is None
    chosen = client.post(
        "/contracts",
        data={"text": "1. Other. Net 30.\n\n2. Law. Saudi law.", "sensitivity": "public"},
    ).json()
    # Choosing a looser label at upload does not skip the sign-off: the detected label stands.
    assert chosen["sensitivity"] == "internal" and chosen["label_set_by"] == "auto"
    assert chosen["label_detected"] == "internal"
    line = data_line(
        {
            "sensitivity": "restricted",
            "allowed": False,
            "reason": "external",
            "label_set_by": "auto",
            "label_reasons": ["Marked “Confidential”"],
        }
    )
    assert line.startswith("Restricted (suggested from the text: marked “Confidential”)")
    lowered = data_line(
        {
            "sensitivity": "internal",
            "allowed": True,
            "location": "external",
            "label_set_by": "person",
            "label_detected": "restricted",
            "label_reasons": ["Marked “Confidential”"],
        }
    )
    assert lowered.startswith(
        "Detected: Restricted (marked “Confidential”). Set to Internal by a person."
    )


def test_medical_supplies_contract_is_restricted_for_its_patient_data():
    """A real catch on the held-out suite: the hospital records each patient's name and medical
    record number against the implants used."""
    s = settings(__import__("pathlib").Path("unused"))
    (d,) = [d for d in s.contract_dirs() if (d / "ho-medical-supplies.md").is_file()]
    found = P.detect_label(
        (d / "ho-medical-supplies.md").read_text(encoding="utf-8"),
        C.load_contract(d, "ho-medical-supplies"),
    )
    assert found.level == "restricted"
    assert "Mentions sensitive personal data (health records)" in found.reasons


def test_lowering_asks_one_fixed_answer_per_kind_of_finding():
    text = (
        'Between Nimbus Cloud Ltd ("Supplier") and Najd Retail LLC ("Customer").\n\n'
        "1. Data. The Supplier processes patient records under the NDA between the parties.\n\n"
        "2. Law. Saudi law."
    )
    found = P.detect_label(text, _contract(text))
    meta = {"detected": found.level, "evidence": found.evidence}
    assert found.level == "restricted"
    to_internal = {g["id"] for g in P.grounds_needed(meta, "internal")}
    assert to_internal == {"nda", "personal-data"}  # names do not stop Internal
    to_public = {g["id"] for g in P.grounds_needed(meta, "public")}
    assert to_public == {"nda", "personal-data", "identifiers"}
    with pytest.raises(ValueError, match="sensitive personal data"):
        P.check_grounds(meta, "internal", {"nda": "nda-ended"})
    reason = P.check_grounds(
        meta, "internal", {"nda": "nda-ended", "personal-data": "data-named-only"}
    )
    assert reason.startswith("The non-disclosure agreement: the non-disclosure agreement has ended")
    assert P.grounds_needed(meta, "restricted") == []  # not lower: nothing to answer
    # Internal by default, nothing specific found: one question about publication.
    plain = {"detected": "internal", "evidence": []}
    assert [g["id"] for g in P.grounds_needed(plain, "public")] == ["unpublished"]


def test_roles_decide_who_opens_a_contract_and_a_finished_review(tmp_path):
    """Omar (procurement) opens Sara's finished review of an Internal contract instead of running
    it again; a Restricted contract and its reviews open only for legal, whatever the screen shows."""
    from hack.auth import hash_password

    users = f"sara:{hash_password('sara-test-password')},omar:{hash_password('omar-test-password')}"
    s = settings(
        tmp_path,
        auth_users=users,
        secret_key="test-secret",
        auth_roles="sara:legal,omar:procurement",
    )
    app = create_app(s, provider_factory=lambda: FakeProvider())
    sara, omar = TestClient(app), TestClient(app)
    sara.post("/auth/login", json={"username": "sara", "password": "sara-test-password"})
    omar.post("/auth/login", json={"username": "omar", "password": "omar-test-password"})
    assert sara.get("/auth/me").json()["role"] == "legal"
    assert omar.get("/auth/me").json()["role"] == "procurement"

    two = "\n\n1. Fees. Net 60.\n\n2. Law. Saudi law."
    secret = sara.post(
        "/contracts", data={"text": "STRICTLY CONFIDENTIAL\n\nBoard deal" + two}
    ).json()["doc_id"]
    plain = sara.post("/contracts", data={"text": 'Between Nimbus Ltd ("Supplier").' + two}).json()[
        "doc_id"
    ]
    for doc in (secret, plain):
        run = sara.post(
            "/run", json={"task": f"Review contract {doc} and route it.", "run_id": f"r-{doc}"}
        )
        assert run.status_code == 200

    listed = {c["doc_id"]: c for c in omar.get("/contracts").json()}
    assert listed[secret]["readable"] is False and listed[secret]["title"] == "Restricted contract"
    assert listed[secret]["last_review"] is None  # not even who reviewed it
    assert listed[plain]["readable"] is True
    assert listed[plain]["last_review"]["by"] == "sara"  # open hers, no second review needed
    mine = omar.get(f"/runs/r-{plain}/review")
    assert mine.status_code == 200 and mine.json()["by"] == "sara"

    # Restricted: refused on every path, not just hidden on screen.
    for path in (f"/contracts/{secret}", f"/runs/r-{secret}/review", f"/runs/r-{secret}/trace"):
        assert omar.get(path).status_code == 403, path
    assert (
        omar.post(
            "/run", json={"task": f"Review contract {secret} and route it.", "run_id": "o-1"}
        ).status_code
        == 403
    )
    assert omar.post("/batches", json={"doc_ids": [secret]}).status_code == 403
    assert f"r-{secret}" not in {r["run_id"] for r in omar.get("/runs").json()}
    # Legal opens both.
    assert sara.get(f"/runs/r-{secret}/review").status_code == 200
    assert P.role_for({}, "anyone") == "legal"  # roles not set: nobody is locked out
    assert P.role_for({"sara": "legal"}, "omar") == "none" and not P.can_read("none", "restricted")
