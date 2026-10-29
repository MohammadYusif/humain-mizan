"""Flag copyleft (GPL/AGPL/LGPL/SSPL) licences among installed distributions.

The hackathon terms (para 6.1) forbid copyleft/viral code in the submission. Run inside the project env:
    uv run python scripts/check_licenses.py
Exit code 1 if anything is flagged. Review hits by hand: metadata is sometimes missing or wrong.
"""

import re
import sys
from importlib.metadata import distributions

BAD = re.compile(r"\b(A?GPL|LGPL|SSPL|GNU (Affero )?General Public)", re.I)


def licence_of(dist) -> str:
    md = dist.metadata
    parts = [md.get("License-Expression") or "", md.get("License") or ""]
    parts += [c for c in (md.get_all("Classifier") or []) if c.startswith("License ::")]
    return " | ".join(p.strip().splitlines()[0] for p in parts if p and p.strip())[:200]


def main() -> int:
    flagged = 0
    for d in sorted(distributions(), key=lambda d: (d.metadata["Name"] or "").lower()):
        name, lic = d.metadata["Name"], licence_of(d)
        bad = bool(BAD.search(lic))
        flagged += bad
        print(f"{'!!' if bad else '  '} {name:35} {d.version:12} {lic or 'UNKNOWN'}")
    print(f"\n{flagged} flagged" if flagged else "\nno copyleft licences detected")
    return 1 if flagged else 0


if __name__ == "__main__":
    sys.exit(main())
