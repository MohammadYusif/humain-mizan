from __future__ import annotations

import json
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any, Literal

from pydantic import BaseModel, ValidationError

from .llm.base import ToolCall, ToolResult, ToolSpec

Risk = Literal["read", "write"]
ApprovalFn = Callable[[str, dict[str, Any]], bool]

MAX_TOOL_OUTPUT_CHARS = 20_000


@dataclass
class Tool:
    name: str
    description: str
    params: type[BaseModel]
    fn: Callable[[Any], Any]
    risk: Risk = "read"
    # Runs before the approval/dry-run gate; raise to reject a call that must never run in this state.
    precheck: Callable[[Any], None] | None = None

    def spec(self) -> ToolSpec:
        return ToolSpec(self.name, self.description, self.params.model_json_schema())


class ToolRegistry:
    """Tools the agent may call. `risk="write"` tools only run when approved; otherwise dry-run."""

    def __init__(self, approve_writes: bool = False, approve: ApprovalFn | None = None) -> None:
        self._tools: dict[str, Tool] = {}
        self._approve = approve or (lambda _name, _args: approve_writes)
        # Optional task-completion check: returns what is still missing (sent to the model as a
        # nudge when it tries to stop early) or None when the task is complete.
        self.finish_check: Callable[[], str | None] | None = None

    def register(
        self,
        name: str,
        description: str,
        params: type[BaseModel],
        risk: Risk = "read",
        precheck: Callable[[Any], None] | None = None,
    ) -> Callable[[Callable[[Any], Any]], Callable[[Any], Any]]:
        def deco(fn: Callable[[Any], Any]) -> Callable[[Any], Any]:
            self._tools[name] = Tool(name, description, params, fn, risk, precheck)
            return fn

        return deco

    def specs(self) -> list[ToolSpec]:
        return [t.spec() for t in self._tools.values()]

    def names(self) -> list[str]:
        return list(self._tools)

    def execute(self, call: ToolCall) -> ToolResult:
        tool = self._tools.get(call.name)
        if tool is None:
            return ToolResult(
                call.id, f"Unknown tool {call.name!r}. Available: {self.names()}", True
            )
        try:
            args = tool.params.model_validate(call.input)
        except ValidationError as e:
            return ToolResult(call.id, f"Invalid arguments for {call.name}: {e}", True)
        if tool.precheck is not None:
            try:
                tool.precheck(args)
            except Exception as e:
                return ToolResult(call.id, f"{type(e).__name__}: {e}", True)
        if tool.risk == "write" and not self._approve(call.name, call.input):
            return ToolResult(
                call.id,
                f"[dry-run] {call.name} was NOT executed (write actions need approval). "
                f"It would have run with {json.dumps(call.input, default=str)}.",
            )
        try:
            out = tool.fn(args)
        except Exception as e:  # tool errors go back to the model, not up the stack
            return ToolResult(call.id, f"{type(e).__name__}: {e}", True)
        return ToolResult(call.id, _to_text(out))


def _to_text(out: Any) -> str:
    text = out if isinstance(out, str) else json.dumps(out, default=str, ensure_ascii=False)
    if len(text) > MAX_TOOL_OUTPUT_CHARS:
        return (
            text[:MAX_TOOL_OUTPUT_CHARS]
            + f"\n[truncated {len(text) - MAX_TOOL_OUTPUT_CHARS} chars]"
        )
    return text
