"""Scripted provider for tests, CI and key-less demos."""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from .base import Completion, ToolCall, ToolResult, ToolSpec, Usage


def text(content: str, *, input_tokens: int = 10, output_tokens: int = 5) -> Completion:
    return Completion(
        text=content,
        tool_calls=[],
        usage=Usage(input_tokens=input_tokens, output_tokens=output_tokens),
        stop_reason="end_turn",
        assistant_message={"role": "assistant", "content": content},
        model="fake",
    )


def call_tools(
    *calls: tuple[str, str, dict[str, Any]], input_tokens: int = 10, output_tokens: int = 5
) -> Completion:
    """Each call is (call_id, tool_name, input)."""
    tcs = [ToolCall(i, n, a) for i, n, a in calls]
    return Completion(
        text="",
        tool_calls=tcs,
        usage=Usage(input_tokens=input_tokens, output_tokens=output_tokens),
        stop_reason="tool_use",
        assistant_message={"role": "assistant", "content": [{"call": c.id} for c in tcs]},
        model="fake",
    )


class FakeProvider:
    name = "fake"

    def __init__(
        self,
        script: list[Completion | Callable[[list[Any]], Completion]] | None = None,
        location: str = "local",
    ) -> None:
        self.model = "fake"
        self.location = location  # tests can stand in for an external API
        self._script = list(script or [text("fake provider: no script given")])
        self.calls: list[dict[str, Any]] = []

    def user_message(self, text: str) -> dict[str, Any]:
        return {"role": "user", "content": text}

    def tool_result_messages(self, results: list[ToolResult]) -> list[dict[str, Any]]:
        return [{"role": "user", "content": [r.__dict__ for r in results]}]

    def complete(
        self, *, system: str, messages: list[Any], tools: list[ToolSpec], max_tokens: int
    ) -> Completion:
        self.calls.append(
            {"system": system, "messages": list(messages), "tools": [t.name for t in tools]}
        )
        step = self._script.pop(0) if len(self._script) > 1 else self._script[0]
        return step(messages) if callable(step) else step
