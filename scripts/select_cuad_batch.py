"""Pick the second real-contract batch from CUAD by a fixed rule, before anyone looks at them.

The rule, written before any contract was read or any run made:
- a CUAD v1 contract whose document type (the filename after the exhibit number) names a service
  the buyer receives: services, hosting, outsourcing, maintenance, support, consulting, processing,
  or development;
- not one of the six CUAD contracts already in evals/real/;
- between 15,000 and 150,000 bytes of text (long enough to be a real agreement, short enough for
  one review);
- ordered by the SHA-256 of the filename (an order nobody chose), the first N.

    uv run python scripts/select_cuad_batch.py [N=12]

Prints one JSON line per pick (id, url, size, CUAD filename). It reads the public Hugging Face
listing of CUAD; nothing is downloaded here.
"""

from __future__ import annotations

import hashlib
import json
import re
import sys
import urllib.request

API = "https://huggingface.co/api/datasets/theatticusproject/cuad/tree/main/CUAD_v1/full_contract_txt/{part}"
RAW = "https://huggingface.co/datasets/theatticusproject/cuad/resolve/main/{path}"
TYPES = re.compile(
    r"SERVICE|HOSTING|OUTSOURC|MAINTENANCE|SUPPORT|CONSULT|PROCESSING|DEVELOPMENT", re.I
)
ALREADY = ("AMERICASSHOPPINGMALL", "BLACKSTONE", "CORIO", "OFG", "VITALIBIS", "XACCT")
MIN_BYTES, MAX_BYTES = 15_000, 150_000


def listing(part: str) -> list[dict]:
    """Every file in one CUAD folder; the API pages by 100 and links the next page."""
    out, url = [], API.format(part=part)
    while url:
        with urllib.request.urlopen(url, timeout=60) as r:
            out += json.load(r)
            nxt = re.search(r'<([^>]+)>;\s*rel="next"', r.headers.get("Link", ""))
        url = nxt.group(1) if nxt else None
    return out


def doc_type(name: str) -> str:
    """'ABILITYINC_06_15_2020-EX-4.25-SERVICES AGREEMENT.txt' -> 'SERVICES AGREEMENT'."""
    stem = name.rsplit("/", 1)[-1].removesuffix(".txt")
    m = re.search(r"EX-?\d+(?:\.\d+)*[A-Z]?[-_ ]+(.*)$", stem, re.I)
    return (m.group(1) if m else stem).replace("_", " ").strip()


def slug(name: str) -> str:
    company = name.rsplit("/", 1)[-1].split("_")[0]
    return "cuad2-" + re.sub(r"[^a-z0-9]+", "-", company.lower()).strip("-")


def main(n: int) -> None:
    files = [f for part in ("Part_I", "Part_II") for f in listing(part) if f["type"] == "file"]
    picks = []
    for f in files:
        name = f["path"]
        if not TYPES.search(doc_type(name)):
            continue
        if any(a in name.upper() for a in ALREADY):
            continue
        if not MIN_BYTES <= f.get("size", 0) <= MAX_BYTES:
            continue
        picks.append((hashlib.sha256(name.encode()).hexdigest(), f))
    picks.sort(key=lambda x: x[0])
    for _, f in picks[:n]:
        name = f["path"]
        print(
            json.dumps(
                {
                    "id": slug(name),
                    "type": doc_type(name),
                    "size": f["size"],
                    "file": name.rsplit("/", 1)[-1],
                    "url": RAW.format(path=urllib.request.quote(name)),
                },
                ensure_ascii=False,
            )
        )
    print(
        f"# {len(picks)} contracts met the rule; took the first {min(n, len(picks))}",
        file=sys.stderr,
    )


if __name__ == "__main__":
    main(int(sys.argv[1]) if len(sys.argv) > 1 else 12)
