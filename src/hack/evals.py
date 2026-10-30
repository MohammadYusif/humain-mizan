"""Eval harness: JSONL cases -> agent runs -> deterministic (+ optional LLM judge) checks -> metrics.

Case format (one JSON object per line):
  {"id": "c1", "input": "...", "checks": [
      {"type": "contains", "value": "42"},
      {"type": "not_contains", "value": "sorry"},
      {"type": "regex", "value": "\\b42\\b"},
      {"type": "tool_called", "value": "calculator"},        # a SUCCESSFUL call (rejected calls don't count)
      {"type": "tool_not_called", "value": "restart_service"},
      {"type": "max_turns", "value": 3},
      {"type": "llm_judge", "rubric": "The answer states the sum correctly and briefly."},
      # contract review, evaluated on the trace (what the tools accepted), not on the model's prose:
      {"type": "finding", "value": "LIAB-CAP", "clause": "c9"},
      {"type": "no_finding", "value": "PAY-TERMS"},          # or "*" = no findings at all
      {"type": "route", "value": "escalate"}]}

Metrics beyond pass rate come from the labels: route accuracy, false auto-approve rate (a case labelled
non-approve that the agent approved or never routed), finding recall and precision (labels are assumed to
list every seeded issue, so an accepted finding outside them counts against precision).

Real-world cases are only partly labelled, so two optional fields keep the metrics honest:
  "scope": ["LIAB-CAP", ...]   rules the labels cover; findings under other rules are neither right nor
                               wrong and are left out of precision.
  "by" on a check              who made the label, e.g. "CUAD" or "CLAUDETTE" (independent annotators) or
                               "team"; recall against independent labels is reported on its own.
"""

from __future__ import annotations

import json
import re
import statistics
import time
import uuid
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any

from .agent import AgentResult
from .config import Settings
from .llm import Provider, build_provider
from .service import run_task
from .tools import ToolRegistry
from .tracing import read_trace

# Label sources made by outside annotators (not by us); see "by" in the module docstring.
INDEPENDENT = ("CUAD", "CLAUDETTE")


@dataclass
class CheckResult:
    type: str
    passed: bool
    detail: str = ""


@dataclass
class CaseResult:
    id: str
    passed: bool
    checks: list[CheckResult]
    final_text: str
    stop_reason: str
    turns: int
    tool_calls: list[str]
    input_tokens: int
    output_tokens: int
    cost_usd: float
    latency_s: float
    run_id: str
    error: str = ""
    expected_route: str | None = None
    got_route: str | None = None
    labelled_rules: list[str] = field(default_factory=list)
    recorded_rules: list[str] = field(default_factory=list)
    checked_rules: list[str] | None = None  # the case's "scope"; None = labels cover every rule
    independent_rules: list[str] = field(default_factory=list)  # labelled by outside annotators

    def in_scope(self, rules: list[str]) -> set[str]:
        return set(rules) if self.checked_rules is None else set(rules) & set(self.checked_rules)


@dataclass
class Report:
    model: str
    provider: str
    cases: list[CaseResult] = field(default_factory=list)

    def summary(self) -> dict[str, Any]:
        n = len(self.cases) or 1
        lat = sorted(c.latency_s for c in self.cases) or [0.0]
        passed = sum(c.passed for c in self.cases)
        cost = sum(c.cost_usd for c in self.cases)
        routed = [c for c in self.cases if c.expected_route]
        non_approve = [c for c in routed if c.expected_route != "approve"]
        labelled = sum(len(c.labelled_rules) for c in self.cases)
        recorded = sum(len(c.in_scope(c.recorded_rules)) for c in self.cases)
        tp = sum(len(set(c.labelled_rules) & set(c.recorded_rules)) for c in self.cases)
        ind = sum(len(c.independent_rules) for c in self.cases)
        ind_tp = sum(len(set(c.independent_rules) & set(c.recorded_rules)) for c in self.cases)
        extra: dict[str, Any] = {}
        if ind:
            extra["independent_recall"] = _ratio(ind_tp, ind)
            extra["independent_labels"] = ind
        if any(c.checked_rules is not None for c in self.cases):
            extra["per_rule"] = _per_rule(self.cases)
        return {
            "model": self.model,
            "provider": self.provider,
            "cases": len(self.cases),
            "passed": passed,
            "pass_rate": round(passed / n, 4),
            "route_accuracy": _ratio(
                sum(c.got_route == c.expected_route for c in routed), len(routed)
            ),
            "false_auto_approve": f"{sum(c.got_route == 'approve' or c.got_route is None for c in non_approve)}/{len(non_approve)}",
            "recall": _ratio(tp, labelled),
            "precision": _ratio(tp, recorded),
            "latency_p50_s": round(statistics.median(lat), 3),
            "latency_p95_s": round(lat[min(len(lat) - 1, int(0.95 * len(lat)))], 3),
            "input_tokens": sum(c.input_tokens for c in self.cases),
            "output_tokens": sum(c.output_tokens for c in self.cases),
            "cost_usd": round(cost, 4),
            "cost_per_pass_usd": round(cost / passed, 4) if passed else None,
            **extra,
        }


def _per_rule(cases: list[CaseResult]) -> dict[str, dict[str, int]]:
    """Per rule: labelled issues, how many the agent found, and in-scope findings beyond the labels."""
    out: dict[str, dict[str, int]] = {}
    for c in cases:
        found = set(c.recorded_rules)
        for r in c.labelled_rules:
            row = out.setdefault(r, {"labelled": 0, "found": 0, "extra": 0})
            row["labelled"] += 1
            row["found"] += r in found
        for r in c.in_scope(c.recorded_rules) - set(c.labelled_rules):
            out.setdefault(r, {"labelled": 0, "found": 0, "extra": 0})["extra"] += 1
    return dict(sorted(out.items()))


def _labels(case: dict[str, Any]) -> dict[str, Any]:
    """Label-derived fields of a CaseResult."""
    checks = case.get("checks", [])
    return {
        "expected_route": next((c["value"] for c in checks if c["type"] == "route"), None),
        "labelled_rules": sorted({c["value"] for c in checks if c["type"] == "finding"}),
        "checked_rules": sorted(case["scope"]) if "scope" in case else None,
        "independent_rules": sorted(
            {c["value"] for c in checks if c["type"] == "finding" and c.get("by") in INDEPENDENT}
        ),
    }


def _ratio(num: int, den: int) -> float | None:
    return round(num / den, 4) if den else None


def load_cases(path: Path) -> list[dict[str, Any]]:
    return [
        json.loads(line)
        for line in Path(path).read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]


def _calls(trace: list[dict[str, Any]], name: str | None = None) -> list[dict[str, Any]]:
    return [
        e
        for e in trace
        if e["type"] == "tool_call" and not e["is_error"] and (name is None or e["name"] == name)
    ]


def recorded_findings(trace: list[dict[str, Any]]) -> set[tuple[str, str]]:
    """(clause_id, rule_id) of findings the tool ACCEPTED (not rejected quotes/rules)."""
    return {
        (e["input"].get("clause_id", ""), e["input"].get("rule_id", ""))
        for e in _calls(trace, "record_finding")
    }


def final_route(trace: list[dict[str, Any]]) -> str | None:
    """The route in force at the end: the last score_contract, voided by any finding recorded after it."""
    if any(e["type"] == "policy_block" for e in trace):
        return "escalate"  # the data policy kept the contract from the model: a lawyer reviews it
    route = None
    for e in _calls(trace):
        if e["name"] in ("record_finding", "clear_tripwire", "submit_clause_map"):
            route = None  # the scoring code voids its route on any of these, so do we
        elif e["name"] in ("score_contract",):
            try:
                route = json.loads(e["output"]).get("route")
            except json.JSONDecodeError:
                route = None
    return route


def run_checks(
    checks: list[dict[str, Any]],
    result: AgentResult,
    judge: Provider | None,
    input_text: str,
    trace: list[dict[str, Any]] | None = None,
) -> list[CheckResult]:
    out: list[CheckResult] = []
    text = result.final_text
    trace = trace or []
    ok_tools = [e["name"] for e in _calls(trace)] if trace else result.tool_names
    for c in checks:
        t, v = c["type"], c.get("value")
        if t == "finding":
            # rule recorded on any clause, or on the clause in "clause" (a list = any of them,
            # e.g. the Arabic and English halves of one bilingual clause)
            hit = {(cl, r) for cl, r in recorded_findings(trace) if r == v}
            want = c.get("clause")
            allowed = [want] if isinstance(want, str) else (want or [])
            ok = bool(hit) if not allowed else any((cl, v) in hit for cl in allowed)
            out.append(CheckResult(t, ok, f"{v} {c.get('clause', '')} recorded={sorted(hit)}"))
        elif t == "no_finding":  # "*" = no findings at all
            rules = {r for _, r in recorded_findings(trace)}
            ok = not rules if v == "*" else v not in rules
            out.append(CheckResult(t, ok, f"{v} recorded={sorted(rules)}"))
        elif t == "route":
            got = final_route(trace)
            out.append(CheckResult(t, got == v, f"expected {v}, got {got}"))
        elif t == "contains":
            out.append(CheckResult(t, str(v).lower() in text.lower(), f"{v!r}"))
        elif t == "not_contains":
            out.append(CheckResult(t, str(v).lower() not in text.lower(), f"{v!r}"))
        elif t == "regex":
            out.append(CheckResult(t, re.search(str(v), text) is not None, f"{v!r}"))
        elif t == "tool_called":
            out.append(CheckResult(t, v in ok_tools, f"{v!r} in {ok_tools}"))
        elif t == "tool_not_called":
            out.append(CheckResult(t, v not in ok_tools, f"{v!r} not in {ok_tools}"))
        elif t == "max_turns":
            out.append(CheckResult(t, result.turns <= int(v), f"{result.turns} <= {v}"))
        elif t == "llm_judge":
            out.append(_judge(judge, c["rubric"], input_text, text))
        else:
            out.append(CheckResult(t, False, "unknown check type"))
    return out


def _judge(judge: Provider | None, rubric: str, task: str, answer: str) -> CheckResult:
    if judge is None:
        return CheckResult("llm_judge", False, "no judge provider configured")
    prompt = (
        f"Task given to an assistant:\n{task}\n\nAssistant's final answer:\n{answer}\n\n"
        f"Rubric: {rubric}\n\nDoes the answer satisfy the rubric? Reply with PASS or FAIL on the first "
        "line, then one sentence of reasoning."
    )
    comp = judge.complete(
        system="You are a strict evaluator.",
        messages=[judge.user_message(prompt)],
        tools=[],
        max_tokens=1000,
    )
    return CheckResult(
        "llm_judge", comp.text.strip().upper().startswith("PASS"), comp.text.strip()[:300]
    )


def run_eval(
    cases: list[dict[str, Any]],
    settings: Settings,
    *,
    provider: Provider | None = None,
    judge: Provider | None = None,
    workers: int = 4,
    judge_enabled: bool = True,
    registry_factory: Callable[[Settings], ToolRegistry] | None = None,
) -> Report:
    provider = provider or build_provider(settings)
    if (
        judge is None
        and judge_enabled
        and any(c["type"] == "llm_judge" for case in cases for c in case.get("checks", []))
    ):
        # Judge stays on Claude even when the model under test is local.
        judge_settings = (
            settings.model_copy(update={"provider": "anthropic"})
            if settings.judge_model.startswith("claude-")
            else settings
        )
        judge = build_provider(judge_settings, settings.judge_model)
    report = Report(model=provider.model, provider=provider.name)

    def one(case: dict[str, Any]) -> CaseResult:
        rid = f"eval-{re.sub(r'[^A-Za-z0-9_-]', '_', str(case['id']))}-{uuid.uuid4().hex[:8]}"
        try:
            r = run_task(
                case["input"],
                settings,
                provider=provider,
                run_id=rid,
                registry=registry_factory(settings) if registry_factory else None,
            )
        except Exception as e:  # a crashed case is a failed case, not a crashed eval
            return CaseResult(
                case["id"],
                False,
                [],
                "",
                "error",
                0,
                [],
                0,
                0,
                0.0,
                0.0,
                rid,
                f"{type(e).__name__}: {e}",
                **_labels(case),  # a crash still counts against route accuracy and recall
            )
        trace = read_trace(settings.runs_dir, r.run_id)
        checks = run_checks(case.get("checks", []), r, judge, case["input"], trace)
        return CaseResult(
            id=case["id"],
            passed=all(c.passed for c in checks),
            checks=checks,
            final_text=r.final_text,
            stop_reason=r.stop_reason,
            turns=r.turns,
            tool_calls=r.tool_names,
            input_tokens=r.usage.input_tokens
            + r.usage.cache_read_tokens
            + r.usage.cache_write_tokens,
            output_tokens=r.usage.output_tokens,
            cost_usd=r.cost_usd,
            latency_s=r.latency_s,
            run_id=r.run_id,
            got_route=final_route(trace),
            recorded_rules=sorted({rule for _, rule in recorded_findings(trace)}),
            **_labels(case),
        )

    with ThreadPoolExecutor(max_workers=max(1, workers)) as pool:
        report.cases = list(pool.map(one, cases))
    return report


def rescore(path: Path, cases: list[dict[str, Any]], settings: Settings) -> Report:
    """Re-grade a saved eval against the CURRENT labels from its stored traces. No model calls:
    the agent's behaviour is unchanged, only the grading (llm_judge results are kept as they were)."""
    from types import SimpleNamespace

    data = json.loads(Path(path).read_text(encoding="utf-8"))
    by_id = {c["id"]: c for c in cases}
    rep = Report(model=data["summary"]["model"], provider=data["summary"]["provider"])
    for old in data["cases"]:
        case = by_id.get(old["id"])
        prev = [CheckResult(**c) for c in old["checks"]]
        if case is None or old.get("error"):
            rep.cases.append(CaseResult(**{**old, "checks": prev}))
            continue
        trace = read_trace(settings.runs_dir, old["run_id"])
        r = SimpleNamespace(
            final_text=old["final_text"], tool_names=old["tool_calls"], turns=old["turns"]
        )
        checks = run_checks(
            [c for c in case["checks"] if c["type"] != "llm_judge"], r, None, case["input"], trace
        ) + [c for c in prev if c.type == "llm_judge"]  # type: ignore[arg-type]
        rep.cases.append(
            CaseResult(
                **{
                    **old,
                    "checks": checks,
                    "passed": all(c.passed for c in checks),
                    "got_route": final_route(trace),
                    "recorded_rules": sorted({rule for _, rule in recorded_findings(trace)}),
                    **_labels(case),
                }
            )
        )
    return rep


def save_report(report: Report, out_dir: Path, extra: dict[str, Any] | None = None) -> Path:
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    safe_model = re.sub(r"[^A-Za-z0-9._-]", "_", report.model)
    path = out_dir / f"{time.strftime('%Y%m%d-%H%M%S')}-{safe_model}.json"
    path.write_text(
        json.dumps(
            {
                "summary": {**report.summary(), **(extra or {})},
                "cases": [asdict(c) for c in report.cases],
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    return path


def format_summary(reports: list[dict[str, Any]]) -> str:
    cols = [
        "model",
        "pass_rate",
        "route_accuracy",
        "false_auto_approve",
        "recall",
        "precision",
        "latency_p50_s",
        "latency_p95_s",
        "cost_usd",
        "cost_per_pass_usd",
    ]
    rows = ["| " + " | ".join(cols) + " |", "|" + "---|" * len(cols)]
    for s in reports:
        rows.append("| " + " | ".join(str(s.get(c)) for c in cols) + " |")
    return "\n".join(rows)
