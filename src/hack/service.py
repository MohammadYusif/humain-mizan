"""Single entry point used by the CLI, the API and the eval harness."""

from __future__ import annotations

from .agent import AgentResult, run_agent
from .challenge.prompts import SYSTEM_PROMPT
from .challenge.tools import build_registry
from .config import Settings
from .llm import Provider, build_provider
from .tools import ToolRegistry
from .tracing import Tracer


def run_task(
    task: str,
    settings: Settings,
    *,
    provider: Provider | None = None,
    system: str | None = None,
    run_id: str | None = None,
    registry: ToolRegistry | None = None,
) -> AgentResult:
    provider = provider or build_provider(settings)
    tracer = Tracer(settings.runs_dir, run_id)
    return run_agent(
        task,
        provider=provider,
        registry=registry or build_registry(settings, tracer.dir),
        system=system or SYSTEM_PROMPT,
        settings=settings,
        tracer=tracer,
    )
