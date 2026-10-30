"""Make image-only "scanned" PDFs of sample contracts, to demo and test OCR.

Each contract is typeset like a printed page, rasterised, then degraded the way a scanner or a phone
camera degrades it (slight rotation, noise, blur, JPEG). Output goes to samples/scans/ (synthetic
contracts we wrote; no third-party text).

    uv run python scripts/make_scan_samples.py
"""

import io
import json
import random
from pathlib import Path

import typst
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
FONTS = ROOT / "src" / "hack" / "assets" / "fonts"
OUT = ROOT / "samples" / "scans"

PAGE = r"""
#let d = json("data.json")
#set page(paper: "a4", margin: (x: 2.3cm, y: 2.2cm))
#set text(font: "IBM Plex Sans Arabic", size: 10.5pt)
#set par(leading: 0.75em, spacing: 1.3em, justify: true)
#align(center, text(size: 13pt, weight: "bold", lang: d.title_lang, d.title))
#v(0.8em)
#for p in d.paras {
  set text(lang: p.lang)
  par(p.text)
}
"""

# name -> (contract, ppi, rotation degrees, noise sigma, blur radius, jpeg quality)
SAMPLES = {
    "ar-data-01-scan": ("ar-data-01", 200, 0.6, 9, 0.5, 70),
    "services-en-01-scan": ("services-en-01", 200, -0.4, 9, 0.5, 70),
    "ar-supply-01-blurry-photo": ("ar-supply-01", 110, 2.2, 24, 1.6, 35),
}


def lang(text: str) -> str:
    ar = sum("؀" <= ch <= "ۿ" for ch in text)
    letters = sum(ch.isalpha() for ch in text) or 1
    return "ar" if ar / letters > 0.5 else "en"


def pages(doc_id: str, ppi: int) -> list[Image.Image]:
    raw = (ROOT / "evals" / "contracts" / f"{doc_id}.md").read_text(encoding="utf-8")
    paras = [p.strip() for p in raw.split("\n\n") if p.strip()]
    title = paras.pop(0).lstrip("# ").strip()
    data = {
        "title": title,
        "title_lang": lang(title),
        "paras": [{"text": p.replace("\n", " "), "lang": lang(p)} for p in paras],
    }
    files = {"main.typ": PAGE.encode(), "data.json": json.dumps(data, ensure_ascii=False).encode()}
    out = typst.compile(
        files, format="png", ppi=ppi, font_paths=[str(FONTS)], ignore_system_fonts=True
    )
    return [Image.open(io.BytesIO(b)) for b in (out if isinstance(out, list) else [out])]


def degrade(img: Image.Image, rot: float, sigma: float, blur: float, quality: int) -> Image.Image:
    g = img.convert("L")
    g = g.rotate(rot, resample=Image.BICUBIC, expand=False, fillcolor=255)
    noise = Image.effect_noise(g.size, sigma)
    g = Image.blend(g, noise, 0.12)
    g = g.filter(ImageFilter.GaussianBlur(blur))
    buf = io.BytesIO()
    g.save(buf, "JPEG", quality=quality)
    return Image.open(buf)


def main() -> None:
    random.seed(7)
    OUT.mkdir(parents=True, exist_ok=True)
    for name, (doc_id, ppi, rot, sigma, blur, q) in SAMPLES.items():
        imgs = [degrade(p, rot, sigma, blur, q) for p in pages(doc_id, ppi)]
        path = OUT / f"{name}.pdf"
        imgs[0].save(path, "PDF", resolution=ppi, save_all=True, append_images=imgs[1:])
        print(f"{path.relative_to(ROOT)}: {len(imgs)} page(s), {path.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
