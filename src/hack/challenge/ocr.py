"""Local OCR for scanned contracts and photos: Tesseract (Apache-2.0) on this machine, pages rendered
with PDFium. A scan never leaves the server for OCR.

Word confidences are kept because a misread word can hide a risky clause: review.score() will not
let a contract whose OCR text is unreliable be approved or negotiated automatically.

Arabic pages are OCR'd even when the PDF has a text layer: PDF text extraction returns Arabic in
visual order with broken ligatures (reversed words, lam-alef split), which would mislead the model.
"""

from __future__ import annotations

import csv
import io
import os
import re
import shutil
from dataclasses import dataclass
from functools import lru_cache

LANGS = ("ara", "eng")
DPI = 300
LOW_CONF = 60  # a word below this Tesseract confidence counts as "low"
MAX_PAGES = 120  # long framework agreements run to ~100 pages
MAX_SIDE_PX = 4200  # A4 at 300 DPI is 2480 x 3508
# Pages are OCR'd in parallel, one Tesseract thread each (more efficient than one page with many).
WORKERS = max(1, min(4, (os.cpu_count() or 2) - 1))
IMAGE_EXTS = (".png", ".jpg", ".jpeg", ".tif", ".tiff", ".webp", ".bmp")


class OcrUnavailable(ValueError):
    """Raised when a document needs OCR but Tesseract (or its Arabic/English data) is missing."""


@dataclass
class PageText:
    text: str
    words: int
    mean_conf: float  # 0-100, over recognised words
    low_words: int


def _cmd() -> str | None:
    return os.environ.get("HACK_TESSERACT") or shutil.which("tesseract") or _windows_default()


def _windows_default() -> str | None:
    for base in (os.environ.get("ProgramFiles"), os.environ.get("LOCALAPPDATA")):
        if base:
            p = os.path.join(base, "Tesseract-OCR", "tesseract.exe")
            if os.path.isfile(p):
                return p
    return None


@lru_cache(maxsize=1)
def status() -> dict:
    """{"available": bool, "langs": [...], "detail": str} for /healthz and error messages."""
    cmd = _cmd()
    if not cmd:
        return {"available": False, "langs": [], "detail": "Tesseract is not installed"}
    import pytesseract

    pytesseract.pytesseract.tesseract_cmd = cmd
    try:
        langs = sorted(set(pytesseract.get_languages()) & set(LANGS))
        version = str(pytesseract.get_tesseract_version())
    except Exception as e:  # broken install
        return {"available": False, "langs": [], "detail": f"Tesseract failed to start: {e}"}
    missing = [lang for lang in LANGS if lang not in langs]
    if missing:
        return {
            "available": False,
            "langs": langs,
            "detail": f"Tesseract {version} is missing language data: {', '.join(missing)}",
        }
    return {"available": True, "langs": langs, "detail": f"Tesseract {version}"}


def _require() -> None:
    st = status()
    if not st["available"]:
        raise OcrUnavailable(
            f"this document needs OCR, which is not available on this server ({st['detail']}); "
            "run Mizan in Docker or install Tesseract with Arabic and English data"
        )


def ocr_image(image) -> PageText:
    """OCR one PIL image. Text keeps Tesseract's paragraph breaks (blank lines), so clauses split."""
    _require()
    import pytesseract

    gray = image.convert("L")
    text, tsv = pytesseract.run_and_get_multiple_output(
        gray, extensions=["txt", "tsv"], lang="+".join(LANGS)
    )
    confs = []
    for row in csv.DictReader(io.StringIO(tsv), delimiter="\t", quoting=csv.QUOTE_NONE):
        try:
            conf = float(row.get("conf") or -1)
        except ValueError:
            continue
        if conf >= 0 and (row.get("text") or "").strip():
            confs.append(conf)
    mean = sum(confs) / len(confs) if confs else 0.0
    return PageText(
        text=clean_text(text),
        words=len(confs),
        mean_conf=round(mean, 1),
        low_words=sum(c < LOW_CONF for c in confs),
    )


_BIDI_MARKS = re.compile("[‎‏‪-‮⁦-⁩]")
_ARABIC = re.compile("[؀-ۿ]")
_MIRRORED = re.compile(r"\)([^()\n]{1,60})\(")
_UPRIGHT = re.compile(r"\(([^()\n]{1,60})\)")


def clean_text(text: str) -> str:
    """Undo two systematic Tesseract artefacts in Arabic lines: direction marks around Latin runs,
    and brackets emitted by glyph shape, so "(12)" comes out as ")12(" in right-to-left text."""
    out = []
    for line in _BIDI_MARKS.sub("", text).split("\n"):
        letters = sum(ch.isalpha() for ch in line) or 1
        if len(_ARABIC.findall(line)) / letters > 0.3 and len(_MIRRORED.findall(line)) > len(
            _UPRIGHT.findall(line)
        ):
            line = line.translate(str.maketrans("()[]", ")(]["))
        out.append(line.rstrip())
    return "\n".join(out).strip()


def render_pdf_page(pdf, index: int):
    """PIL image of one page of an open pypdfium2 document, at OCR resolution (capped, so an
    oversized page cannot exhaust memory)."""
    page = pdf[index]
    w, h = page.get_size()
    scale = min(DPI / 72, MAX_SIDE_PX / max(w, h, 1))
    return page.render(scale=scale).to_pil()


def ocr_pdf_pages(pdf, n_pages: int) -> dict[int, PageText]:
    """OCR every page of an open pypdfium2 document. PDFium is not thread-safe, so pages are
    rendered here in order, a batch at a time (bounded memory), and only Tesseract runs in parallel."""
    from concurrent.futures import ThreadPoolExecutor

    _require()
    os.environ.setdefault("OMP_THREAD_LIMIT", "1")
    out: dict[int, PageText] = {}
    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        for start in range(0, n_pages, WORKERS):
            batch = range(start, min(n_pages, start + WORKERS))
            images = {i: render_pdf_page(pdf, i) for i in batch}
            for i, page in zip(batch, pool.map(ocr_image, [images[i] for i in batch]), strict=True):
                out[i] = page
    return out


def summary(pages: dict[int, PageText], total_pages: int, reason: str) -> dict:
    """Source metadata stored next to the contract and shown in the UI and the memo."""
    words = sum(p.words for p in pages.values())
    low = sum(p.low_words for p in pages.values())
    mean = sum(p.mean_conf * p.words for p in pages.values()) / words if words else 0.0
    return {
        "kind": "ocr",
        "engine": status()["detail"],
        "reason": reason,
        "pages_total": total_pages,
        "pages_ocr": sorted(i + 1 for i in pages),
        "words": words,
        "mean_conf": round(mean, 1),
        "low_conf_share": round(low / words, 3) if words else 1.0,
    }
