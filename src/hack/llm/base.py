from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Protocol


@dataclass
class ToolSpec:
    name: str
    description: str
    input_schema: dict[str, Any]


@dataclass
class ToolCall:
    id: str
    name: str
    input: dict[str, Any]


@dataclass
class ToolResult:
    call_id: str
    content: str
    is_error: bool = False


@dataclass
class Usage:
    input_tokens: int = 0
    output_tokens: int = 0
    cache_read_tokens: int = 0
    cache_write_tokens: int = 0

    def add(self, other: Usage) -> None:
        self.input_tokens += other.input_tokens
        self.output_tokens += other.output_tokens
        self.cache_read_tokens += other.cache_read_tokens
        self.cache_write_tokens += other.cache_write_tokens

    @property
    def total(self) -> int:
        return (
            self.input_tokens
            + self.output_tokens
            + self.cache_read_tokens
            + self.cache_write_tokens
        )


@dataclass
class Completion:
    text: str
    tool_calls: list[ToolCall]
    usage: Usage
    # end_turn | tool_use | max_tokens | refusal | other
    stop_reason: str
    # Provider-native message to append to the history unchanged (keeps thinking blocks intact).
    assistant_message: Any
    model: str
    latency_s: float = 0.0
    request_id: str | None = None
    extra: dict[str, Any] = field(default_factory=dict)


class Provider(Protocol):
    name: str
    model: str

    def user_message(self, text: str) -> Any: ...

    def tool_result_messages(self, results: list[ToolResult]) -> list[Any]: ...

    def complete(
        self,
        *,
        system: str,
        messages: list[Any],
        tools: list[ToolSpec],
        max_tokens: int,
    ) -> Completion: ...
