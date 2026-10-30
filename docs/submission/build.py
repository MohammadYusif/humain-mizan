"""Builds the submission assets: deck PDF, logo PNG and background image (run from the repo root)."""

from pathlib import Path

import typst

HERE = Path(__file__).parent
FONTS = [str(Path("src/hack/assets/fonts"))]


def build(src: str, out: str, **kw) -> None:
    if "source" in kw:
        (HERE / src).write_text(kw.pop("source"), encoding="utf-8")
    typst.compile(str(HERE / src), output=str(HERE / out), root=".", font_paths=FONTS, **kw)
    print("wrote", HERE / out)


PAPER = "oklch(96.8%, 0.013, 84deg)"

LOGO = """#set page(width: 512pt, height: 512pt, margin: 0pt, fill: none)
#image("../../src/hack/assets/logo.svg", width: 100%)
"""

BACKGROUND = f"""#set page(width: 1920pt, height: 1080pt, margin: 0pt, fill: {PAPER})
#place(top + left, dx: 0pt, dy: 0pt, rect(width: 100%, height: 14pt, fill: oklch(37%, 0.062, 166deg)))
#place(right + horizon, dx: -150pt, image("../../src/hack/assets/logo.svg", width: 560pt))
#place(left + bottom, dx: 140pt, dy: -120pt, line(length: 520pt, stroke: 3pt + oklch(68%, 0.1, 80deg)))
"""

if __name__ == "__main__":
    build("deck.typ", "mizan-deck.pdf")
    build("_logo.typ", "logo-512.png", source=LOGO, format="png", ppi=72)
    build("_logo.typ", "logo-100.png", source=LOGO, format="png", ppi=72 * 100 / 512)
    build("_background.typ", "background.png", source=BACKGROUND, format="png", ppi=72)
    for f in ("_logo.typ", "_background.typ"):
        (HERE / f).unlink()
