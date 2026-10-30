from __future__ import annotations

import json
import time
from dataclasses import dataclass, field
from typing import Any

from . import pricing
from .config import Settings
from .llm.base import Provider, ToolResult, Usage
from .tools import ToolRegistry
from .tracing import Tracer


@dataclass
class AgentResult:
    run_id: str
    final_text: str
    # end_turn | max_turns | budget_exceeded | max_tokens | refusal | loop | other
    stop_reason: str
    turns: int
    tool_names: list[str] = field(default_factory=list)
    usage: Usage = field(default_factory=Usage)
    cost_usd: float = 0.0
    latency_s: float = 0.0
    model: str = ""


MAX_NUDGES = 2
MAX_IDENTICAL_CALLS = 2  # the 3rd identical call (same tool, same arguments) is not executed


def run_agent(
    task: str,
    *,
    provider: Provider,
    registry: ToolRegistry,
    system: str,
    settings: Settings,
    tracer: Tracer,
    max_turns: int | None = None,
    start_meta: dict[str, Any] | None = None,
) -> AgentResult:
    """Manual tool-use loop: model -> tools -> model, with a turn cap, a USD budget and a full trace."""
    max_turns = max_turns or settings.max_turns
    messages: list[Any] = [provider.user_message(task)]
    usage = Usage()
    cost = 0.0
    tool_names: list[str] = []
    final_text = ""
    stop = "max_turns"
    turns = 0
    nudges = 0
    seen: dict[str, int] = {}  # tool-call signature -> times called
    stuck_turns = 0
    t0 = time.perf_counter()
    tracer.event(
        "run_start", task=task, model=provider.model, provider=provider.name, **(start_meta or {})
    )

    while turns < max_turns:
        if cost >= settings.budget_usd:
            stop = "budget_exceeded"
            break
        turns += 1
        try:
            comp = provider.complete(
                system=system,
                messages=messages,
                tools=registry.specs(),
                max_tokens=settings.max_tokens,
            )
        except Exception as e:
            tracer.event("error", where="llm", error=f"{type(e).__name__}: {e}")
            # Close the run so listings show it as failed rather than "running" forever.
            tracer.event(
                "run_end",
                stop_reason="error",
                turns=turns,
                usage=usage.__dict__,
                cost_usd=round(cost, 6),
                latency_s=round(time.perf_counter() - t0, 3),
                priced=pricing.is_priced(
                    provider.model, settings.price_input_per_mtok, settings.price_output_per_mtok
                ),
            )
            raise
        usage.add(comp.usage)
        step_cost = pricing.cost_usd(
            provider.model,
            comp.usage,
            settings.price_input_per_mtok,
            settings.price_output_per_mtok,
        )
        cost += step_cost
        tracer.event(
            "llm_call",
            turn=turns,
            stop_reason=comp.stop_reason,
            text=comp.text,
            tool_calls=[{"id": c.id, "name": c.name, "input": c.input} for c in comp.tool_calls],
            usage=comp.usage.__dict__,
            cost_usd=round(step_cost, 6),
            latency_s=round(comp.latency_s, 3),
            request_id=comp.request_id,
        )
        messages.append(comp.assistant_message)
        if comp.text:
            final_text = comp.text

        if comp.stop_reason == "tool_use" and comp.tool_calls:
            results: list[ToolResult] = []
            guarded = 0
            for call in comp.tool_calls:
                tool_names.append(call.name)
                s = time.perf_counter()
                sig = call.name + json.dumps(call.input, sort_keys=True, default=str)
                seen[sig] = seen.get(sig, 0) + 1
                if seen[sig] > MAX_IDENTICAL_CALLS:
                    # Loop guard: an identical call gives an identical result; don't run it again.
                    guarded += 1
                    hint = registry.finish_check() if registry.finish_check else None
                    res = ToolResult(
                        call.id,
                        f"Repeated call: {call.name} already ran {seen[sig] - 1} times with these "
                        "exact arguments, so repeating it changes nothing. Change the arguments "
                        "(for a rejected quote, copy the exact words from the clause) or move on."
                        + (f" {hint}" if hint else ""),
                        True,
                    )
                    tracer.event("loop_guard", turn=turns, name=call.name, repeats=seen[sig] - 1)
                else:
                    res = registry.execute(call)
                tracer.event(
                    "tool_call",
                    turn=turns,
                    name=call.name,
                    input=call.input,
                    output=res.content[:4000],
                    is_error=res.is_error,
                    duration_s=round(time.perf_counter() - s, 3),
                )
                results.append(res)
            messages.extend(provider.tool_result_messages(results))
            # Two turns in a row made of nothing but repeats: the model is stuck. Stop and let the
            # workflow route the run to a human instead of burning the remaining turns.
            stuck_turns = stuck_turns + 1 if guarded == len(comp.tool_calls) else 0
            if stuck_turns >= 2:
                stop = "loop"
                break
            continue

        # The model wants to stop. If the task's own completion check says work is left, tell it
        # what is missing and continue (bounded), instead of accepting a half-finished run.
        if comp.stop_reason == "end_turn" and nudges < MAX_NUDGES and registry.finish_check:
            missing = registry.finish_check()
            if missing:
                nudges += 1
                tracer.event("nudge", turn=turns, n=nudges, text=missing)
                messages.append(provider.user_message(missing))
                continue

        stop = comp.stop_reason if comp.stop_reason != "tool_use" else "other"
        break

    latency = time.perf_counter() - t0
    result = AgentResult(
        run_id=tracer.run_id,
        final_text=final_text,
        stop_reason=stop,
        turns=turns,
        tool_names=tool_names,
        usage=usage,
        cost_usd=round(cost, 6),
        latency_s=round(latency, 3),
        model=provider.model,
    )
    tracer.event(
        "run_end",
        stop_reason=stop,
        turns=turns,
        usage=usage.__dict__,
        cost_usd=result.cost_usd,
        latency_s=result.latency_s,
        priced=pricing.is_priced(
            provider.model, settings.price_input_per_mtok, settings.price_output_per_mtok
        ),
    )
    return result
