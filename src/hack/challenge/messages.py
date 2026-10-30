"""The message to the counterparty, built by code from the recorded redlines: a title line, then
one numbered change per critical or major finding, cited by the contract's own article numbers.
The model's own wording is never sent, so the format does not depend on how a run phrased it."""

from __future__ import annotations

import re
from collections.abc import Iterable, Mapping
from typing import Any

_REF_AR = re.compile(r"^\s*((?:المادة|البند)\s+[^\s:،.\-–]+(?:\s+[^\s:،.\-–]+)?)")
_REF_EN = re.compile(
    r"^\s*((?:article|section|clause)\s+\d+(?:\.\d+)*|\d+(?:\.\d+)*)[.):]?\s*(?:[-–—]\s*)?([A-Z][^.:\n]{1,48}?)[.:]",
    re.I,
)


def clause_ref(text: str, fallback: str) -> str:
    """How the counterparty knows a clause: the contract's own number and heading ("Clause 3
    (Termination)", "المادة الرابعة"), never our internal clause id."""
    if m := _REF_AR.match(text):
        return m.group(1).strip()
    if m := _REF_EN.match(text):
        num, heading = m.group(1).strip(), m.group(2).strip()
        label = num[:1].upper() + num[1:] if num[0].isalpha() else f"Clause {num}"
        return f"{label} ({heading})"
    return fallback


def requested_changes(
    title: str, findings: Iterable[Mapping[str, Any]], texts: Mapping[str, str]
) -> str:
    """Empty when there is nothing to ask for (no critical or major finding)."""
    changes = [f for f in findings if f.get("severity") in ("critical", "major")]
    if not changes:
        return ""
    arabic = bool(re.search(r"[؀-ۿ]", title))
    lines = [f"التعديلات المطلوبة على {title}" if arabic else f"Requested changes to {title}", ""]
    for n, f in enumerate(changes, 1):
        ref = clause_ref(texts.get(f["clause_id"], ""), f.get("clause_type") or f["clause_id"])
        lines.append(f"{n}. {ref}: {str(f['redline']).strip()}")
    return "\n".join(lines)
