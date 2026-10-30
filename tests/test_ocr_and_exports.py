"""OCR ingest (scans, Arabic PDFs), the OCR confidence gate, and the PDF exports."""

import io
import json
import shutil
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from pypdf import PdfReader

from hack import exports as X
from hack.api import create_app
from hack.challenge import contracts as C
from hack.challenge import ocr
from hack.challenge.review import OCR_MIN_CONF, ocr_doubt
from hack.config import Settings
from test_contract_review import NDA_TYPES, read_all, tag
from test_workflow import run_batch, scripted_review, settings

SAMPLES = Path(__file__).resolve().parents[1] / "samples" / "scans"
GOOD = {"kind": "ocr", "mean_conf": 93.0, "low_conf_share": 0.03, "pages_ocr": [1]}
BAD = {"kind": "ocr", "mean_conf": 61.0, "low_conf_share": 0.31, "pages_ocr": [1]}


def typeset_pdf(paras: list[str]) -> bytes:
    """A text-layer PDF, typeset the way the exports are."""
    import typst

    data = {"paras": [{"text": p, "lang": C.detect_lang(p)} for p in paras]}
    main = b'#let d = json("data.json")\n#set text(font: "IBM Plex Sans Arabic")\n#for p in d.paras { set text(lang: p.lang); par(p.text) }'
    files = {"main.typ": main, "data.json": json.dumps(data, ensure_ascii=False).encode()}
    return typst.compile(files, format="pdf", font_paths=[str(X.FONTS)], ignore_system_fonts=True)


def blank_pdf() -> bytes:
    """An image-only page, like a scan."""
    from PIL import Image

    buf = io.BytesIO()
    Image.new("L", (600, 800), 255).save(buf, "PDF")
    return buf.getvalue()


@pytest.fixture
def fake_ocr(monkeypatch):
    """OCR without Tesseract: every page reads as the same two clauses at the given confidence."""
    seen = []

    def fake(image):
        seen.append(image.size)
        return ocr.PageText(
            "1. Services. The supplier provides analytics services.\n\n"
            "2. Law. This agreement is governed by the laws of the Kingdom of Saudi Arabia.",
            words=20,
            mean_conf=92.0,
            low_words=1,
        )

    monkeypatch.setattr(ocr, "ocr_image", fake)
    monkeypatch.setattr(
        ocr, "status", lambda: {"available": True, "langs": ["ara", "eng"], "detail": "fake"}
    )
    return seen


def test_ocr_doubt_thresholds():
    assert ocr_doubt(None) is None
    assert ocr_doubt(GOOD) is None
    reason = ocr_doubt(BAD)
    assert reason and "61%" in reason and "31%" in reason and "lawyer" in reason
    assert ocr_doubt({**GOOD, "mean_conf": OCR_MIN_CONF - 0.1}) is not None
    assert ocr_doubt({"kind": "unknown"}) is not None  # unreadable sidecar is not trusted


def test_ocr_text_cleanup_fixes_tesseract_arabic_artefacts():
    raw = "المادة الثانية: لمدة ‎اثني عشر‏ )12( شهرًا.\nPrice (USD) is fixed )sic(."
    assert (
        ocr.clean_text(raw)
        == "المادة الثانية: لمدة اثني عشر (12) شهرًا.\nPrice (USD) is fixed )sic(."
    )
    broken = "عقد خدمات\n\nالمادة الأولى: يتولى المورد الخدمات وفقًا\n\nللملحق رقم (1).\n\nالمادة الثانية: المدة سنة."
    paras = C.join_broken_paragraphs(broken).split("\n\n")
    assert len(paras) == 3 and paras[1].endswith("للملحق رقم (1).")


def test_low_confidence_scan_cannot_be_approved(tmp_path):
    """The same clean NDA approves when typed, and escalates when its text came from a poor scan."""
    from hack.challenge.tools import build_registry

    up = tmp_path / "up"
    up.mkdir()
    shutil.copy(Settings().contracts_dir / "nda-en-01.md", up / "up-nda-scan.md")
    s = Settings(provider="fake", runs_dir=tmp_path / "runs", web_dir=tmp_path, uploads_dir=up)

    def run() -> tuple[str, dict]:
        reg = build_registry(s)
        ids = read_all(reg, "up-nda-scan")
        tag(reg, "up-nda-scan", ids, NDA_TYPES)
        score = json.loads(reg.execute(_call("score_contract", doc_id="up-nda-scan")).content)
        return score["route"], score

    assert run()[0] == "approve"
    (up / "up-nda-scan.source.json").write_text(json.dumps(GOOD))
    assert run()[0] == "approve"  # a confident scan is trusted like typed text
    (up / "up-nda-scan.source.json").write_text(json.dumps(BAD))
    r, score = run()
    assert r == "escalate" and any("OCR confidence" in x for x in score["reasons"])
    assert score["source"]["mean_conf"] == 61.0
    page = json.loads(
        build_registry(s).execute(_call("load_contract", doc_id="up-nda-scan")).content
    )
    assert "read from a scan by OCR" in page["source_note"]


def _call(name, **args):
    from hack.llm.base import ToolCall

    return ToolCall("x", name, args)


def test_text_layer_pdf_skips_ocr_but_arabic_and_scanned_pages_need_it(monkeypatch):
    en = typeset_pdf(
        [
            "Service Agreement",
            "1. Services. The supplier provides services.",
            "2. Law. Saudi law applies.",
        ]
    )
    text, source = C.extract("a.pdf", en)
    assert "supplier provides services" in text and source is None
    monkeypatch.setattr(
        ocr,
        "status",
        lambda: {"available": False, "langs": [], "detail": "Tesseract is not installed"},
    )
    ar = typeset_pdf(["المادة الأولى: يقدم المورد خدمات التحليلات للعميل وفق هذه الاتفاقية."] * 3)
    with pytest.raises(ocr.OcrUnavailable, match="needs OCR.*not installed"):
        C.extract("ar.pdf", ar)  # PDF extraction scrambles Arabic: never trust it silently
    with pytest.raises(ocr.OcrUnavailable):
        C.extract("scan.pdf", blank_pdf())
    with pytest.raises(ocr.OcrUnavailable):
        C.extract("photo.jpg", _jpeg())


def with_blank_page(pdf: bytes) -> bytes:
    from pypdf import PdfWriter

    w = PdfWriter()
    for part in (pdf, blank_pdf()):
        w.append(io.BytesIO(part))
    buf = io.BytesIO()
    w.write(buf)
    return buf.getvalue()


def test_text_pdf_with_a_page_without_text_ocrs_only_that_page(monkeypatch, fake_ocr):
    paras = [
        "Supply Agreement",
        "1. Supply. The supplier delivers goods monthly.",
        "2. Law. Saudi law applies.",
    ]
    mixed = with_blank_page(typeset_pdf(paras * 4))
    text, src = C.extract("m.pdf", mixed)
    assert "supplier delivers" in text and "Kingdom of Saudi Arabia" in text
    assert src["pages_ocr"] == [2] and len(fake_ocr) == 1  # only the page without text
    monkeypatch.setattr(ocr, "status", lambda: {"available": False, "langs": [], "detail": "none"})
    text, src = C.extract("m.pdf", mixed)
    assert "supplier delivers" in text and src == {
        "kind": "unread",
        "pages_total": 2,
        "pages_unread": [2],
    }
    assert "page 2" in ocr_doubt(src)  # a page nobody read cannot be approved


def test_numbered_clauses_in_one_pdf_block_are_split():
    raw = (
        "Support Agreement\n\n1. DEFINITIONS\n1.1 Incident means a fault.\n1.2 Hours are 9 to 5.\n"
        "2. FEES\nFees are due within 30\ndays of invoice.\n\nSigned."
    )
    title, clauses = C.split_clauses(C.to_contract_markdown(raw, "x"))
    assert [c.text for c in clauses] == [
        "1. DEFINITIONS",
        "1.1 Incident means a fault.",
        "1.2 Hours are 9 to 5.",
        "2. FEES Fees are due within 30 days of invoice.",
        "Signed.",
    ]


def _jpeg() -> bytes:
    from PIL import Image

    buf = io.BytesIO()
    Image.new("RGB", (400, 300), "white").save(buf, "JPEG")
    return buf.getvalue()


def test_scanned_pdf_and_photo_go_through_ocr(fake_ocr):
    text, source = C.extract("scan.pdf", blank_pdf())
    assert "Kingdom of Saudi Arabia" in text
    assert (
        source["kind"] == "ocr"
        and source["pages_ocr"] == [1]
        and source["reason"] == "scanned pages"
    )
    assert source["mean_conf"] == 92.0 and source["low_conf_share"] == 0.05
    _, src = C.extract("photo.jpg", _jpeg())
    assert src["reason"] == "image upload"
    ar = typeset_pdf(["المادة الأولى: يقدم المورد خدمات التحليلات للعميل وفق هذه الاتفاقية."] * 3)
    assert "Arabic" in C.extract("ar.pdf", ar)[1]["reason"]
    with pytest.raises(ValueError, match="could not be read"):
        C.extract("x.png", b"\x89PNG not really")


def test_upload_of_a_scan_records_ocr_confidence(tmp_path, fake_ocr):
    s = settings(tmp_path)
    client = TestClient(create_app(s))
    r = client.post("/contracts", files={"file": ("scan.pdf", blank_pdf(), "application/pdf")})
    assert r.status_code == 200, r.text
    doc = r.json()
    assert doc["ocr"]["mean_conf"] == 92.0 and doc["clauses"] == 2
    assert (s.uploads_dir / f"{doc['doc_id']}.source.json").is_file()
    listed = next(c for c in client.get("/contracts").json() if c["doc_id"] == doc["doc_id"])
    assert listed["ocr"]["kind"] == "ocr"
    assert client.get(f"/contracts/{doc['doc_id']}").json()["ocr"]["pages_ocr"] == [1]
    assert "ocr" in client.get("/healthz").json()


@pytest.mark.skipif(not ocr.status()["available"], reason="Tesseract with ara+eng not installed")
def test_real_tesseract_reads_the_sample_scans():
    """The committed sample scans: a clean Arabic scan is trusted, a blurry photo is not."""
    text, src = C.extract("scan.pdf", (SAMPLES / "ar-data-01-scan.pdf").read_bytes())
    md = C.to_contract_markdown(text, "x")
    assert "الرواتب" in md and ocr_doubt(src) is None, src
    _, blurry = C.extract("photo.pdf", (SAMPLES / "ar-supply-01-blurry-photo.pdf").read_bytes())
    assert ocr_doubt(blurry) is not None, blurry
    en, src = C.extract("scan.pdf", (SAMPLES / "services-en-01-scan.pdf").read_bytes())
    assert "terminate" in en.lower() and ocr_doubt(src) is None, src


# --- PDF exports -------------------------------------------------------------------------------


def pdf_text(data: bytes) -> str:
    return "\n".join(p.extract_text() or "" for p in PdfReader(io.BytesIO(data)).pages)


def test_pdf_exports_redline_and_memo(tmp_path):
    s = settings(tmp_path)
    client = TestClient(create_app(s))
    _, st = run_batch(s, lambda: scripted_review("services-en-01"), ["services-en-01"], False)
    rid = st["items"][0]["run_id"]
    r = client.get(f"/runs/{rid}/export/redline.pdf")
    assert r.status_code == 200 and r.headers["content-type"] == "application/pdf"
    assert "attachment" in r.headers["content-disposition"] and r.content.startswith(b"%PDF")
    body = " ".join(pdf_text(r.content).split())
    assert "Client may terminate this Agreement only" in body  # the struck quote
    assert "Either party may terminate on 60 days" in body  # the proposed wording
    assert "TERM-CONV" in body and "not legal advice" in body
    m = client.get(f"/runs/{rid}/export/memo.pdf")
    memo = " ".join(pdf_text(m.content).split())
    assert m.status_code == 200 and "TERM-CONV" in memo and "Negotiate" in memo
    for bad in ("evil.exe", "redline.docx", "memo.docx"):
        assert client.get(f"/runs/{rid}/export/{bad}").status_code == 404
    assert client.get("/runs/nope/export/memo.pdf").status_code == 404


def test_contract_text_cannot_inject_typst_markup():
    s = Settings(provider="fake")
    evil = '#set page(width: 1pt) ] } #import "x.typ": * $x$ <l> @r *b* _i_ \\'
    view = {
        "doc_id": "services-en-01", "route": "negotiate", "risk_score": 15,
        "counts": {"critical": 0, "major": 1, "minor": 0}, "reasons": [evil], "memo": evil,
        "findings": [{"clause_id": "c4", "rule_id": "TERM-CONV", "severity": "major", "quote": "x" * 9,
                      "issue": evil, "redline": evil, "clause_type": "Termination"}],
        "tripwires": [], "actions": [],
    }  # fmt: skip
    for data in (X.redline_pdf(s, view, "r1"), X.memo_pdf(s, view, "r1")):
        assert '#set page(width: 1pt) ] } #import "x.typ"' in " ".join(pdf_text(data).split())


def test_arabic_redline_pdf_is_typeset_right_to_left():
    s = Settings(provider="fake")
    quote = "فائدة تأخير بنسبة اثنين في المائة"
    view = {
        "doc_id": "ar-data-01", "route": "negotiate",
        "findings": [{"clause_id": "c4", "rule_id": "INTEREST", "severity": "major", "quote": quote,
                      "issue": "riba", "redline": "رسم إداري ثابت", "clause_type": "Late payment charges"}],
    }  # fmt: skip
    segs = X._segments(C.load_contract(s.contracts_dir, "ar-data-01").clause("c4").text, [quote])
    assert [x["text"] for x in segs if x["del"]] == [quote]
    data = X.redline_pdf(s, view, "r1")
    assert data.startswith(b"%PDF") and b"IBMPlexSansArabic" in data
