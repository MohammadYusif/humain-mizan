"""Structured view of a contract-review run, derived from its trace (what the tools accepted)."""

import json
import re
from typing import Any

from .playbook import BY_ID

_PY_LIST = re.compile(r"\[('[^\]]*')\]")


def _clean_reason(reason: str) -> str:
    """Runs recorded before reasons were formatted show Python lists (['c7']); render as text."""
    return _PY_LIST.sub(lambda m: m.group(1).replace("'", ""), reason)


def review_view(trace: list[dict[str, Any]]) -> dict[str, Any]:
    doc_id: str | None = None
    findings: dict[tuple[str, str], dict[str, Any]] = {}
    score: dict[str, Any] | None = None
    clause_map: dict[str, list[str]] | None = None
    actions: list[dict[str, Any]] = []
    cleared: list[dict[str, Any]] = []
    memo = ""
    policy: dict[str, Any] | None = None
    blocked: dict[str, Any] | None = None
    for e in trace:
        if e["type"] == "run_start":
            policy = e.get("data_policy")
        elif e["type"] == "policy_block":
            blocked = e
            doc_id = e.get("doc_id")
        if e["type"] != "tool_call" or e["is_error"]:
            continue
        name, inp = e["name"], e["input"]
        if name == "load_contract":
            doc_id = inp.get("doc_id")
        elif name == "record_finding":
            rule = BY_ID.get(inp.get("rule_id", ""))
            findings[(inp["clause_id"], inp["rule_id"])] = {
                "clause_id": inp["clause_id"],
                "rule_id": inp["rule_id"],
                "severity": rule.severity if rule else "minor",
                "clause_type": rule.clause_type if rule else "",
                "quote": inp.get("quote", ""),
                "issue": inp.get("issue", ""),
                "redline": inp.get("redline", ""),
                "confidence": inp.get("confidence"),
            }
            score = None  # a finding after the score voids it, as in the scoring code
        elif name == "clear_tripwire":
            cleared.append({k: inp.get(k, "") for k in ("clause_id", "rule_id", "reason", "quote")})
            score = None
        elif name == "submit_clause_map":
            clause_map = {c["clause_id"]: c["clause_types"] for c in inp.get("clauses", [])}
            score = None
        elif name == "score_contract":
            try:
                score = json.loads(e["output"])
            except json.JSONDecodeError:
                score = None
        elif name in ("send_to_counterparty", "escalate_to_legal"):
            actions.append(
                {
                    "kind": "counterparty" if name == "send_to_counterparty" else "legal",
                    "dry_run": e["output"].startswith("[dry-run]"),
                    "text": inp.get("message") or inp.get("question") or "",
                }
            )
        elif name == "render_outputs":
            memo = inp.get("memo", "")
    order = {"critical": 0, "major": 1, "minor": 2}
    fs = sorted(findings.values(), key=lambda f: (order.get(f["severity"], 3), f["clause_id"]))
    if blocked is not None and score is None:
        score = {
            "route": "escalate",
            "risk_score": None,
            "counts": None,
            "reasons": [blocked["reason"]],
        }
    return {
        "doc_id": doc_id,
        "route": score["route"] if score else None,
        "risk_score": score["risk_score"] if score else None,
        "counts": score["counts"] if score else None,
        "reasons": [_clean_reason(r) for r in score["reasons"]] if score else [],
        "injected": score.get("injected", []) if score else [],
        "tripwires": score.get("tripwires", []) if score else [],
        "source": score.get("source") if score else None,
        "cap_evidence": score.get("cap_evidence") if score else None,
        "cleared": cleared,
        "findings": fs,
        "clause_map": clause_map,
        "actions": actions,
        "memo": memo,
        # Which contracts this model may see, and what was done to the text before it did.
        "data_policy": policy,
    }
