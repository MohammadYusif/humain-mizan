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
                return Contract(doc_id, title, clauses)
    raise FileNotFoundError(f"no contract {doc_id!r}")


# --- Ingest of user-supplied contracts (paste, .txt/.md, .docx, .pdf) -------------------------

MAX_UPLOAD_BYTES = 5_000_000
MAX_CHARS = 300_000
MAX_CLAUSES = 400
_CLAUSE_START = re.compile(
    r"^(\d+(\.\d+)*[.)]?\s|(article|section|clause)\s+\d+|(المادة|البند)\s|[٠-٩]+[.)-]\s)", re.I
)


def extract_text(filename: str, data: bytes) -> str:
    if len(data) > MAX_UPLOAD_BYTES:
        raise ValueError(f"file too large (max {MAX_UPLOAD_BYTES // 1_000_000} MB)")
    ext = Path(filename).suffix.lower()
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
    if ext == ".pdf":
        import io

        from pypdf import PdfReader

        try:
            text = "\n".join((p.extract_text() or "") for p in PdfReader(io.BytesIO(data)).pages)
        except Exception as e:  # pypdf stream/structure errors from a corrupt file
            raise ValueError("this PDF could not be read (corrupt or not a PDF)") from e
        if not text.strip():
            raise ValueError(
                "no extractable text in this PDF (scanned PDFs need OCR, which is out of scope)"
            )
        return text
    raise ValueError("unsupported file type: use .txt, .md, .docx or .pdf")


def to_contract_markdown(raw: str, title_hint: str) -> str:
    """Normalise extracted text into '# Title' + one paragraph per clause."""
    text = raw.replace("\r\n", "\n").replace("\r", "\n").strip()
    if not text:
        raise ValueError("the contract is empty")
    if len(text) > MAX_CHARS:
        raise ValueError(f"contract too long (max {MAX_CHARS:,} characters)")
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
    if len(paras) > MAX_CLAUSES:
        raise ValueError(f"too many paragraphs ({len(paras)}); max {MAX_CLAUSES}")
    return f"# {title}\n\n" + "\n\n".join(paras) + "\n"


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
