"""Builds the submission assets: deck PDF and logo PNGs (run from the repo root). The background
image is cover.html, rendered by render-cover.mjs."""

import os
from pathlib import Path

import typst

HERE = Path(__file__).parent
FONTS = [str(Path("src/hack/assets/fonts"))]


def build(src: str, out: str, **kw) -> None:
    if "source" in kw:
        (HERE / src).write_text(kw.pop("source"), encoding="utf-8")
    typst.compile(str(HERE / src), output=str(HERE / out), root=".", font_paths=FONTS, **kw)
    print("wrote", HERE / out)


LOGO = """#set page(width: 512pt, height: 512pt, margin: 0pt, fill: none)
#image("../../src/hack/assets/logo.svg", width: 100%)
"""


if __name__ == "__main__":
    build("deck.typ", "mizan-deck.pdf")
    # The judges' copy carries the demo sign-in; it is git-ignored and never committed.
    if (user := os.environ.get("HACK_DECK_USER")) and (pw := os.environ.get("HACK_DECK_PASSWORD")):
        build("deck.typ", "mizan-deck-judges.pdf", sys_inputs={"user": user, "password": pw})
    build("_logo.typ", "logo-512.png", source=LOGO, format="png", ppi=72)
    build("_logo.typ", "logo-100.png", source=LOGO, format="png", ppi=72 * 100 / 512)
    for f in ("_logo.typ",):
        (HERE / f).unlink()
