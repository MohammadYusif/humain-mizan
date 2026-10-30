"""Contract loading, paging, clause splitting (Arabic/English), quote verification, injection scan."""

import re
from dataclasses import dataclass
from pathlib import Path

PAGE_CHARS = 12_000  # per get_clauses page; stays well under the tool-output cap

_DOC_ID = re.compile(r"^[A-Za-z0-9_-]{1,64}$")
_TASHKEEL = re.compile(r"[ً-ٰٟـ]")  # diacritics + tatweel
_ARABIC = re.compile(r"[؀-ۿ]")
_LETTER = re.compile(r"[^\W\d_]")
_DIGITS = str.maketrans("٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹", "01234567890123456789")
# Instructions aimed at an AI reviewer. Matching clauses force escalation (the text is untrusted data).
_INJECTION = re.compile(
    r"(note|message|instruction|notice|attention)s?\s+(to|for)\s+(the\s+)?"
    r"(automated|ai\b|a\.i\.|assistant|reviewer|llm|language model)"
    r"|ignore\s+(all\s+|any\s+)?(previous|prior|above|the playbook|your)"
    r"|pre-?approved\s+by"
    r"|do\s+not\s+(record|flag|report)\s+(any\s+)?(findings?|issues?|deviations?)"
    r"|تجاهل\s+(جميع\s+)?(التعليمات|القواعد)"
    r"|ملاحظة\s+(إلى|الى|ل)\s*(المراجع|النظام)",
    re.I,
)


@dataclass
class Clause:
    id: str
    lang: str  # "ar" | "en"
    text: str


@dataclass
class Contract:
    doc_id: str
    title: str
    clauses: list[Clause]
    # How the text was obtained when it was not typed: {"kind": "ocr", "mean_conf": ..., ...}
    source: dict | None = None

    def clause(self, clause_id: str) -> Clause | None:
        return next((c for c in self.clauses if c.id == clause_id), None)


def detect_lang(text: str) -> str:
    letters = _LETTER.findall(text)
    if not letters:
        return "en"
    return "ar" if len(_ARABIC.findall(text)) / len(letters) > 0.5 else "en"


def split_clauses(text: str) -> tuple[str, list[Clause]]:
    """Paragraph = clause. A leading '# ' paragraph is the title and is not a clause."""
    paras = [p.strip() for p in re.split(r"\n\s*\n", text.strip()) if p.strip()]
    title = ""
    if paras and paras[0].startswith("# "):
        title = paras.pop(0)[2:].strip()
    return title, [Clause(f"c{i}", detect_lang(p), p) for i, p in enumerate(paras, 1)]


def load_contract(dirs: Path | list[Path], doc_id: str) -> Contract:
    """Look the contract up in each directory in order (samples first, then uploads)."""
    if not _DOC_ID.match(doc_id):
        raise ValueError("doc_id may only contain letters, digits, '-' and '_'")
    for d in [dirs] if isinstance(dirs, Path) else dirs:
        for ext in (".md", ".txt"):
            path = Path(d) / f"{doc_id}{ext}"
            if path.is_file():
                title, clauses = split_clauses(path.read_text(encoding="utf-8"))
                return Contract(doc_id, title, clauses, read_source(path))
    raise FileNotFoundError(f"no contract {doc_id!r}")


def source_path(contract_path: Path) -> Path:
    """Sidecar with how an uploaded contract's text was obtained (e.g. OCR confidence)."""
    return contract_path.with_name(f"{contract_path.stem}.source.json")


def read_source(contract_path: Path) -> dict | None:
    import json

    p = source_path(contract_path)
    if not p.is_file():
        return None
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except ValueError:
        return {"kind": "unknown"}  # unreadable sidecar: treated as unverified text


# --- Ingest of user-supplied contracts (paste, .txt/.md, .docx, .pdf) -------------------------

MAX_UPLOAD_BYTES = 5_000_000
MAX_CHARS = 300_000
MAX_CLAUSES = 400
_CLAUSE_START = re.compile(
    r"^(\d+(\.\d+)*[.)]?\s|(article|section|clause)\s+\d+|(المادة|البند)\s|[٠-٩]+[.)-]\s)", re.I
)


MIN_PAGE_LETTERS = 20  # a PDF page with fewer extractable letters is treated as a scan


def extract_text(filename: str, data: bytes) -> str:
    return extract(filename, data)[0]


def extract(filename: str, data: bytes) -> tuple[str, dict | None]:
    """Text of an uploaded contract, plus source metadata when it came from OCR."""
    if len(data) > MAX_UPLOAD_BYTES:
        raise ValueError(f"file too large (max {MAX_UPLOAD_BYTES // 1_000_000} MB)")
    ext = Path(filename).suffix.lower()
    if ext == ".pdf":
        return _extract_pdf(data)
    from . import ocr

    if ext in ocr.IMAGE_EXTS:
        return _extract_image(data)
    return _extract_plain(ext, data), None


def _extract_plain(ext: str, data: bytes) -> str:
    if ext in (".txt", ".md", ""):
        try:
            return data.decode("utf-8-sig")
        except UnicodeDecodeError:
            return data.decode("cp1256")  # legacy Windows Arabic encoding
    if ext == ".docx":
        import io

        from docx import Document

        try:
            doc = Document(io.BytesIO(data))
        except Exception as e:  # zip/xml errors from a corrupt or mislabelled file
            raise ValueError(
                "this .docx file could not be read (corrupt or not a Word document)"
            ) from e
        parts = [p.text.strip() for p in doc.paragraphs if p.text.strip()]
        for table in doc.tables:  # clauses are sometimes laid out in tables
            for row in table.rows:
                cells = [c.text.strip() for c in row.cells if c.text.strip()]
                if cells:
                    parts.append(" | ".join(dict.fromkeys(cells)))
        return "\n\n".join(parts)
    raise ValueError(
        "unsupported file type: use .pdf, .docx, .txt, .md or a scan (.png, .jpg, .tif)"
    )


_SENTENCE_END = re.compile(r"[.!?؟:;؛)»\"]\s*$")


def join_broken_paragraphs(text: str) -> str:
    """OCR often ends a paragraph at the short last line of a justified (especially right-to-left)
    paragraph. Rejoin a paragraph to the previous one when the previous one stops mid-sentence and
    this one does not start a new clause."""
    paras = [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]
    out: list[str] = []
    for p in paras:
        if out and not _SENTENCE_END.search(out[-1]) and not _CLAUSE_START.match(p):
            out[-1] = f"{out[-1]}\n{p}"
        else:
            out.append(p)
    return "\n\n".join(out)


def _arabic_share(text: str) -> float:
    letters = _LETTER.findall(text)
    return len(_ARABIC.findall(text)) / len(letters) if letters else 0.0


def _extract_pdf(data: bytes) -> tuple[str, dict | None]:
    """Text-layer PDFs are read directly. Scanned pages, and pages that are mostly Arabic (PDF text
    extraction scrambles Arabic), are read by OCR; then every page is OCR'd so the paragraph
    structure is consistent and no page is silently skipped."""
    import io

    from pypdf import PdfReader

    from . import ocr

    try:
        texts = [(p.extract_text() or "") for p in PdfReader(io.BytesIO(data)).pages]
    except Exception as e:  # pypdf stream/structure errors from a corrupt file
        raise ValueError("this PDF could not be read (corrupt or not a PDF)") from e
    if not texts:
        raise ValueError("this PDF has no pages")
    scanned = [i for i, t in enumerate(texts) if len(_LETTER.findall(t)) < MIN_PAGE_LETTERS]
    arabic = [i for i, t in enumerate(texts) if i not in scanned and _arabic_share(t) > 0.3]
    if not scanned and not arabic:
        return "\n".join(texts), None
    if not arabic and len(scanned) * 2 <= len(texts):
        return _fill_untexted_pages(data, texts, scanned)
    if len(texts) > ocr.MAX_PAGES:
        raise ValueError(f"this PDF needs OCR and has {len(texts)} pages (max {ocr.MAX_PAGES})")
    reason = (
        "scanned pages"
        if scanned and not arabic
        else "Arabic text (PDF text extraction scrambles Arabic)"
        if arabic and not scanned
        else "scanned pages and Arabic text"
    )
    import pypdfium2 as pdfium

    try:
        pdf = pdfium.PdfDocument(data)
    except Exception as e:
        raise ValueError("this PDF could not be rendered for OCR (corrupt or encrypted)") from e
    try:
        pages = ocr.ocr_pdf_pages(pdf, len(texts))
    finally:
        pdf.close()
    text = join_broken_paragraphs("\n\n".join(pages[i].text for i in sorted(pages)))
    if len(_LETTER.findall(text)) < MIN_PAGE_LETTERS:
        raise ValueError("no readable text found in this PDF, even with OCR")
    return text, ocr.summary(pages, len(texts), reason)


def _fill_untexted_pages(
    data: bytes, texts: list[str], pages: list[int]
) -> tuple[str, dict | None]:
    """A text PDF with a few pages that have no text layer: covers, blank pages, or a scanned
    signature page or exhibit. Those pages alone are OCR'd. Without OCR they cannot be read, and
    since a clause could be on them, the source records it and the contract escalates."""
    from . import ocr

    if not ocr.status()["available"]:
        return "\n".join(texts), {
            "kind": "unread",
            "pages_total": len(texts),
            "pages_unread": [i + 1 for i in pages],
        }
    import pypdfium2 as pdfium

    try:
        pdf = pdfium.PdfDocument(data)
    except Exception as e:
        raise ValueError("this PDF could not be rendered for OCR (corrupt or encrypted)") from e
    try:
        read = {i: ocr.ocr_image(ocr.render_pdf_page(pdf, i)) for i in pages}
    finally:
        pdf.close()
    texts = [read[i].text if i in read else t for i, t in enumerate(texts)]
    with_words = {i: p for i, p in read.items() if p.words}
    if not with_words:  # the pages were blank
        return "\n".join(texts), None
    return "\n".join(texts), ocr.summary(with_words, len(texts), "pages without a text layer")


def _extract_image(data: bytes) -> tuple[str, dict | None]:
    """A photo or scan of a contract (multi-page TIFFs page by page)."""
    import io

    from PIL import Image, ImageOps, UnidentifiedImageError

    from . import ocr

    try:
        img = Image.open(io.BytesIO(data))
        frames = []
        for n in range(getattr(img, "n_frames", 1)):
            if n >= ocr.MAX_PAGES:
                break
            img.seek(n)
            frames.append(ImageOps.exif_transpose(img.copy()))  # phone photos carry rotation
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError) as e:
        raise ValueError("this image could not be read (corrupt or not an image)") from e
    pages = {i: ocr.ocr_image(f) for i, f in enumerate(frames)}
    text = join_broken_paragraphs("\n\n".join(pages[i].text for i in sorted(pages)))
    if len(_LETTER.findall(text)) < MIN_PAGE_LETTERS:
        raise ValueError("no readable text found in this image")
    return text, ocr.summary(pages, len(frames), "image upload")


GROUP_ABOVE = (
    150  # more paragraphs than this: group them, so the reviewer types ~150 clauses, not 800
)
_HEADING_MAX = 80


def group_paragraphs(paras: list[str], target_clauses: int = 130) -> list[str]:
    """Long documents (framework agreements, ToS, DOCX with a paragraph per list item or table row)
    come out as hundreds of short paragraphs. Group consecutive ones into clauses of a few hundred
    characters. A clause ends once it reaches the target size, or earlier at a heading or numbered
    item, so sections stay together and nothing is dropped or reordered."""
    target = max(500, sum(map(len, paras)) // target_clauses)
    out: list[str] = []
    cur: list[str] = []
    size = 0
    for p in paras:
        starts = bool(_NUMBERED.match(p) or _CLAUSE_START.match(p)) or (
            len(p) <= _HEADING_MAX and not _LINE_END.search(p)
        )
        if cur and (size >= target or (starts and size >= target // 2)):
            out.append("\n".join(cur))
            cur, size = [], 0
        cur.append(p)
        size += len(p)
    if cur:
        out.append("\n".join(cur))
    return out


def to_contract_markdown(
    raw: str, title_hint: str, max_chars: int = MAX_CHARS, max_clauses: int = MAX_CLAUSES
) -> str:
    """Normalise extracted text into '# Title' + one paragraph per clause."""
    text = raw.replace("\r\n", "\n").replace("\r", "\n").strip()
    if not text:
        raise ValueError("the contract is empty")
    if len(text) > max_chars:
        raise ValueError(f"contract too long (max {max_chars:,} characters)")
    paras = [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]
    if len(paras) < 3:  # PDF-style text: single newlines only -> regroup on clause numbering
        paras, cur = [], []
        for line in (ln.strip() for ln in text.split("\n")):
            if not line:
                continue
            if cur and _CLAUSE_START.match(line):
                paras.append(" ".join(cur))
                cur = []
            cur.append(line)
        if cur:
            paras.append(" ".join(cur))
    else:
        paras = [q for p in paras for q in _split_numbered(p)]
    paras = [re.sub(r"\s*\n\s*", " ", p) for p in paras]  # unwrap hard line breaks
    paras = [p for p in paras if len(_LETTER.findall(p)) >= 3]  # drop "---", page numbers, etc.
    title = title_hint
    if paras and paras[0].startswith("# "):
        title = paras.pop(0)[2:].strip()
    elif len(paras) > 1 and len(paras[0]) <= 150 and not _CLAUSE_START.match(paras[0]):
        title = paras.pop(0)
    if len(paras) < 2:
        raise ValueError(
            "found fewer than 2 clauses: paste the full contract, one clause per paragraph"
        )
    if len(paras) > GROUP_ABOVE:
        paras = group_paragraphs(paras)
    if len(paras) > max_clauses:
        raise ValueError(f"too many paragraphs ({len(paras)}); max {max_clauses}")
    return f"# {title}\n\n" + "\n\n".join(paras) + "\n"


# Stricter than _CLAUSE_START: a number needs a dot or bracket ("4." / "4.2" / "4)"), so a wrapped
# line that happens to begin with "30 days" is not taken for a new clause.
_NUMBERED = re.compile(
    r"^(\d+(\.\d+)*[.)]\s|\d+(\.\d+)+\s|(article|section|clause)\s+\d+|(المادة|البند)\s|[٠-٩]+[.)-]\s)",
    re.I,
)
_LINE_END = re.compile(r"[.!?:;؛)]$")


def _split_numbered(para: str) -> list[str]:
    """Split a block that holds several numbered clauses (PDF text often has no blank line between
    them). A new clause starts at a numbered line that follows a finished sentence or a short
    heading line."""
    lines = [ln.strip() for ln in para.split("\n") if ln.strip()]
    if sum(bool(_NUMBERED.match(ln)) for ln in lines) < 2:
        return [para]
    out: list[str] = []
    cur: list[str] = []
    for ln in lines:
        if cur and _NUMBERED.match(ln) and (len(cur[-1]) < 80 or _LINE_END.search(cur[-1])):
            out.append("\n".join(cur))
            cur = []
        cur.append(ln)
    if cur:
        out.append("\n".join(cur))
    return out


def upload_id(name: str, data: bytes) -> str:
    import hashlib

    slug = re.sub(r"[^a-z0-9]+", "-", Path(name).stem.lower()).strip("-")[:40] or "upload"
    return f"up-{slug}-{hashlib.sha1(data).hexdigest()[:6]}"


def paginate(contract: Contract, page_chars: int = PAGE_CHARS) -> list[list[str]]:
    """Clause ids per page, greedy by size. Always at least one page."""
    pages: list[list[str]] = [[]]
    size = 0
    for c in contract.clauses:
        if pages[-1] and size + len(c.text) > page_chars:
            pages.append([])
            size = 0
        pages[-1].append(c.id)
        size += len(c.text)
    return pages


def find_injection(contract: Contract) -> list[str]:
    return [c.id for c in contract.clauses if _INJECTION.search(c.text)]


def normalize(text: str) -> str:
    text = text.translate(_DIGITS)
    text = _TASHKEEL.sub("", text)
    text = re.sub("[أإآ]", "ا", text)  # alef variants -> alef
    text = text.replace("ة", "ه")  # teh marbuta -> heh
    text = text.replace("ى", "ي").replace("ی", "ي")  # alef maksura/Farsi yeh -> yeh
    text = text.replace("ک", "ك")  # Farsi kaf -> kaf
    for a, b in (("“", '"'), ("”", '"'), ("«", '"'), ("»", '"')):
        text = text.replace(a, b)
    text = text.replace("’", "'").replace("‘", "'").replace("*", "")
    return re.sub(r"\s+", " ", text).strip().casefold()


_CHARMAP = {
    **{a: b for a, b in zip("٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹", "01234567890123456789", strict=True)},
    "أ": "ا", "إ": "ا", "آ": "ا",
    "ة": "ه", "ى": "ي", "ی": "ي", "ک": "ك",
    "“": '"', "”": '"', "«": '"', "»": '"', "’": "'", "‘": "'",
}  # fmt: skip


def normalize_with_map(text: str) -> tuple[str, list[int]]:
    """Same output as normalize(), plus, for each output char, its index in the original text,
    so a match found in normalised text can be shown in the contract's own wording."""
    out: list[str] = []
    idx: list[int] = []
    for i, ch in enumerate(text):
        if _TASHKEEL.match(ch) or ch == "*":
            continue
        ch = _CHARMAP.get(ch, ch)
        if ch.isspace():
            if out and out[-1] != " ":
                out.append(" ")
                idx.append(i)
            continue
        for c in ch.casefold():
            out.append(c)
            idx.append(i)
    if out and out[-1] == " ":
        out.pop()
        idx.pop()
    return "".join(out), idx


def original_excerpt(text: str, idx: list[int], start: int, end: int, limit: int = 120) -> str:
    """The original words behind normalised span [start, end), widened to whole words."""
    if not idx:
        return ""
    a, b = idx[min(start, len(idx) - 1)], idx[min(end, len(idx)) - 1] + 1
    while a > 0 and not text[a - 1].isspace():
        a -= 1
    while b < len(text) and not text[b].isspace():
        b += 1
    s = text[a:b].strip()
    if len(s) > limit:
        cut = s[:limit].rsplit(" ", 1)[0]
        s = cut + " …"
    return s


def quote_in_clause(quote: str, clause: Clause) -> bool:
    q = normalize(quote)
    return len(q) >= 8 and q in normalize(clause.text)
