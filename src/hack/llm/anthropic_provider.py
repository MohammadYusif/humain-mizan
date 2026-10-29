from __future__ import annotations

import time
from typing import Any

import anthropic

from .base import Completion, ToolCall, ToolResult, ToolSpec, Usage

_STOP = {
    "end_turn": "end_turn",
    "stop_sequence": "end_turn",
    "tool_use": "tool_use",
    "max_tokens": "max_tokens",
    "refusal": "refusal",
}


class AnthropicProvider:
    name = "anthropic"

    def __init__(self, model: str, effort: str = "", api_key: str | None = None) -> None:
        self.model = model
        self.effort = effort
        # SDK default: 2 retries on 429/5xx/connection errors with backoff.
        self.client = anthropic.Anthropic(api_key=api_key)

    def user_message(self, text: str) -> dict[str, Any]:
        return {"role": "user", "content": text}

    def tool_result_messages(self, results: list[ToolResult]) -> list[dict[str, Any]]:
        # All results for one assistant turn go back in a single user message.
        blocks = []
        for r in results:
            block: dict[str, Any] = {
                "type": "tool_result",
                "tool_use_id": r.call_id,
                "content": r.content,
            }
            if r.is_error:
                block["is_error"] = True
            blocks.append(block)
        return [{"role": "user", "content": blocks}]

    def complete(
        self,
        *,
        system: str,
        messages: list[Any],
        tools: list[ToolSpec],
        max_tokens: int,
    ) -> Completion:
        kwargs: dict[str, Any] = {
            "model": self.model,
            "max_tokens": max_tokens,
            "system": system,
            "messages": messages,
            "cache_control": {"type": "ephemeral"},
        }
        if tools:
            kwargs["tools"] = [
                {"name": t.name, "description": t.description, "input_schema": t.input_schema}
                for t in tools
            ]
        if self.effort:
            kwargs["output_config"] = {"effort": self.effort}

        t0 = time.perf_counter()
        resp = self.client.messages.create(**kwargs)
        latency = time.perf_counter() - t0

        text = "".join(b.text for b in resp.content if b.type == "text")
        calls = [
            ToolCall(b.id, b.name, dict(b.input)) for b in resp.content if b.type == "tool_use"
        ]
        u = resp.usage
        usage = Usage(
            input_tokens=u.input_tokens or 0,
            output_tokens=u.output_tokens or 0,
            cache_read_tokens=getattr(u, "cache_read_input_tokens", 0) or 0,
            cache_write_tokens=getattr(u, "cache_creation_input_tokens", 0) or 0,
        )
        return Completion(
            text=text,
            tool_calls=calls,
            usage=usage,
            stop_reason=_STOP.get(resp.stop_reason or "", "other"),
            # Pass the content blocks back unchanged (thinking blocks must survive the round trip).
            assistant_message={"role": "assistant", "content": resp.content},
            model=resp.model,
            latency_s=latency,
            request_id=getattr(resp, "_request_id", None),
        )
