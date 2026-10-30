"""Single entry point used by the CLI, the API and the eval harness."""

from __future__ import annotations

import re
from typing import Any

from .agent import AgentResult, run_agent
from .challenge import contracts as C
from .challenge import policy as P
from .challenge.prompts import SYSTEM_PROMPT
from .challenge.tools import build_registry
from .config import Settings
from .llm import Provider, build_provider
from .llm.base import Usage
from .tools import ToolRegistry
from .tracing import Tracer

# "Review contract <doc_id> and route it." (the UI, the batch queue and the evals all ask this way)
TASK_DOC = re.compile(r"contract\s+([A-Za-z0-9_-]{1,64})")


def data_policy(task: str, settings: Settings, provider: Provider) -> dict[str, Any] | None:
    """The data-policy decision for the contract a task names, recorded on the run. None when the
    task names no contract (the tool gate still applies to anything the model tries to load)."""
    m = TASK_DOC.search(task)
    if not m:
        return None
    location = P.provider_location(provider, settings)
    d = P.decide(settings, m.group(1), location)
    rec = {**d.record(), "provider": provider.name, "model": provider.model}
    info = P.label_info(settings, d.doc_id)
    if info["label_set_by"]:  # how the label was set, for the audit
        rec["label_set_by"] = info["label_set_by"]
        rec["label_detected"] = info["label_detected"]
        rec["label_reasons"] = info["label_reasons"]
        if info["label_set_by"] == "person":  # who signed it off, when and why
            rec["label_set_by_name"] = info["label_set_by_name"]
            rec["label_set_at"] = info["label_set_at"]
            rec["label_change_reason"] = info["label_change_reason"]
    if d.allowed and d.redact:
        try:
            contract = C.load_contract(settings.contract_dirs(), d.doc_id)
            rec["redacted"] = P.Redactor.for_contract(contract).summary()
        except (FileNotFoundError, ValueError):
            pass
    return rec


def run_task(
    task: str,
    settings: Settings,
    *,
    provider: Provider | None = None,
    system: str | None = None,
    run_id: str | None = None,
    registry: ToolRegistry | None = None,
    started_by: str | None = None,
) -> AgentResult:
    provider = provider or build_provider(settings)
    tracer = Tracer(settings.runs_dir, run_id)
    policy = data_policy(task, settings, provider)
    if policy is not None and not policy["allowed"]:
        # Not one model call: the contract goes to a lawyer as it is.
        tracer.event(
            "run_start",
            task=task,
            model=provider.model,
            provider=provider.name,
            data_policy=policy,
            started_by=started_by,
        )
        tracer.event("policy_block", **policy)
        tracer.event(
            "run_end",
            stop_reason="policy",
            turns=0,
            usage=Usage().__dict__,
            cost_usd=0.0,
            latency_s=0.0,
            priced=True,
        )
        return AgentResult(tracer.run_id, policy["reason"], "policy", 0, model=provider.model)
    location = P.provider_location(provider, settings)
    return run_agent(
        task,
        provider=provider,
        registry=registry or build_registry(settings, tracer.dir, location),
        system=system or SYSTEM_PROMPT,
        settings=settings,
        tracer=tracer,
        start_meta={"data_policy": policy, "started_by": started_by}
        if policy
        else {"started_by": started_by},
    )
