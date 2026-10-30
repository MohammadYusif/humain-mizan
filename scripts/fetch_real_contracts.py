"""Fetch and convert the real-world eval contracts listed in evals/real/sources.json.

The texts belong to third parties (SEC filers, the Saudi Ministry of Finance, EXPRO, ToS publishers),
so they are kept under data/real/ (git- and docker-ignored) and never committed; only the source
list, checksums and our labels are tracked. Each download is checked against its pinned SHA-256.

    uv run python scripts/fetch_real_contracts.py                # download + convert everything
    uv run python scripts/fetch_real_contracts.py --only cuad-x  # one document
Some government sites reject automated downloads (they answer with a small "Request Rejected" page,
which the checksum catches). Download those by hand from the URL in sources.json and save the file
as data/real/raw/<id>.<format>; the script verifies the checksum and converts it.
Arabic PDFs need OCR (Tesseract), which is in the Docker image:
    docker compose run --rm -v ./data/real:/app/data/real -v ./scripts:/app/scripts \
        app python scripts/fetch_real_contracts.py
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import urllib.request
from html.parser import HTMLParser
from pathlib import Path

from hack.challenge import contracts as C

ROOT = Path(__file__).resolve().parents[1]
SOURCES = ROOT / "evals" / "real" / "sources.json"
RAW = ROOT / "data" / "real" / "raw"
OUT = ROOT / "data" / "real" / "contracts"
ANN = ROOT / "data" / "real" / "annotations"
# SEC asks automated clients to declare who they are; this is that declaration, not a disguise.
USER_AGENT = "Mizan-eval MohammadYusif@users.noreply.github.com"
MAX_CHARS, MAX_CLAUSES = 400_000, 700


class _Text(HTMLParser):
    """HTML (EDGAR exhibits) to text with a blank line between block elements."""

    BLOCK = {"p", "div", "tr", "li", "h1", "h2", "h3", "h4", "h5", "h6", "table", "center"}

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self.skip = 0

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style"):
            self.skip += 1
        elif tag in self.BLOCK:
            self.parts.append("\n\n")
        elif tag == "br":
            self.parts.append("\n")
        elif tag in ("td", "th"):
            self.parts.append(" ")

    def handle_endtag(self, tag):
        if tag in ("script", "style"):
            self.skip = max(0, self.skip - 1)
        elif tag in self.BLOCK:
            self.parts.append("\n\n")

    def handle_data(self, data):
        if not self.skip:
            self.parts.append(data)


def html_to_text(html: str) -> str:
    p = _Text()
    p.feed(html)
    text = "".join(p.parts).replace("\xa0", " ")
    paras = [re.sub(r"[ \t\r\f\v]+", " ", x).strip() for x in re.split(r"\n\s*\n", text)]
    return "\n\n".join(x for x in paras if x)


_TAG = re.compile(r"<(/?)([a-z]+)(\d)>")


def claudette_to_text(xml: str) -> tuple[str, list[dict]]:
    """CLAUDETTE ToS: plain text with inline tags such as <ltd2>...</ltd2> (2 = potentially unfair,
    3 = clearly unfair). Returns the text without tags and the tagged spans."""
    spans: list[dict] = []
    for m in re.finditer(r"<([a-z]+)(\d)>(.*?)</\1\2>", xml, flags=re.S):
        spans.append(
            {"tag": m.group(1), "level": int(m.group(2)), "text": _TAG.sub("", m.group(3))}
        )
    return _TAG.sub("", xml), spans


def set_title(md: str, title: str) -> str:
    """Use the title from sources.json: the first line of a filing is often header noise."""
    return f"# {title}" + md[md.index("\n") :]


def fetch(src: dict) -> bytes:
    path = RAW / f"{src['id']}.{src['format']}"
    if path.is_file():
        data = path.read_bytes()
    else:
        req = urllib.request.Request(src["url"], headers={"User-Agent": USER_AGENT})
        with urllib.request.urlopen(req, timeout=120) as r:  # noqa: S310 (URLs are pinned in git)
            data = r.read()
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
    digest = hashlib.sha256(data).hexdigest()
    if src.get("sha256") and digest != src["sha256"]:
        path.unlink()  # not the pinned document (often a block page): never convert it
        raise ValueError(
            f"checksum mismatch ({len(data):,} bytes): download {src['url']} by hand to {path}"
        )
    if not src.get("sha256"):
        print(f"  {src['id']}: not pinned yet, sha256={digest}")
    return data


def convert(src: dict, data: bytes) -> tuple[str, dict | None, list[dict]]:
    fmt = src["format"]
    if fmt == "pdf":
        text, source = C._extract_pdf(data)
        return text, source, []
    if fmt == "docx":
        return C._extract_plain(".docx", data), None, []
    if fmt == "html":
        return html_to_text(data.decode("utf-8", errors="replace")), None, []
    if fmt == "xml":  # CLAUDETTE
        text, spans = claudette_to_text(data.decode("utf-8", errors="replace"))
        return text, None, spans
    return data.decode("utf-8", errors="replace"), None, []


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", help="comma-separated ids")
    args = ap.parse_args()
    sources = json.loads(SOURCES.read_text(encoding="utf-8"))
    only = set(args.only.split(",")) if args.only else None
    OUT.mkdir(parents=True, exist_ok=True)
    failed = 0
    for src in sources:
        if only and src["id"] not in only:
            continue
        try:
            data = fetch(src)
            raw, source, spans = convert(src, data)
            md = C.to_contract_markdown(raw, src["title"], MAX_CHARS, MAX_CLAUSES)
            md = set_title(md, src["title"])
        except Exception as e:  # report and carry on with the rest
            failed += 1
            print(f"FAIL {src['id']}: {type(e).__name__}: {e}", file=sys.stderr)
            continue
        path = OUT / f"{src['id']}.md"
        path.write_text(md, encoding="utf-8")
        sidecar = C.source_path(path)
        if source:
            sidecar.write_text(json.dumps(source, ensure_ascii=False), encoding="utf-8")
        else:
            sidecar.unlink(missing_ok=True)
        if spans:
            ANN.mkdir(parents=True, exist_ok=True)
            (ANN / f"{src['id']}.json").write_text(
                json.dumps(spans, ensure_ascii=False, indent=1), encoding="utf-8"
            )
        title, clauses = C.split_clauses(md)
        ocr = f", OCR {source['mean_conf']:.0f}%" if source else ""
        print(f"{src['id']}: {len(clauses)} clauses, {len(md):,} chars{ocr}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
