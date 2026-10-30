"""Any OpenAI-compatible chat endpoint (vLLM, Ollama, llama.cpp server, hosted open models).

Install with `uv sync --extra openai`. Not for Claude models: those go through AnthropicProvider.
"""

from __future__ import annotations

import json
import time
from typing import Any

from .base import Completion, ToolCall, ToolResult, ToolSpec, Usage

_STOP = {
    "stop": "end_turn",
    "tool_calls": "tool_use",
    "length": "max_tokens",
    "content_filter": "refusal",
}


class OpenAICompatProvider:
    name = "openai_compat"

    def __init__(self, model: str, base_url: str, api_key: str = "none") -> None:
        from openai import OpenAI

        from ..challenge.policy import url_location

        self.model = model
        self.base_url = base_url
        # local for a server on this machine or network (e.g. Ollama), else external
        self.location = url_location(base_url)
        self.client = OpenAI(base_url=base_url, api_key=api_key)

    def user_message(self, text: str) -> dict[str, Any]:
        return {"role": "user", "content": text}

    def tool_result_messages(self, results: list[ToolResult]) -> list[dict[str, Any]]:
        return [{"role": "tool", "tool_call_id": r.call_id, "content": r.content} for r in results]

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
            "messages": [{"role": "system", "content": system}, *messages],
        }
        if tools:
            kwargs["tools"] = [
                {
                    "type": "function",
                    "function": {
                        "name": t.name,
                        "description": t.description,
                        "parameters": t.input_schema,
                    },
                }
                for t in tools
            ]

        t0 = time.perf_counter()
        resp = self.client.chat.completions.create(**kwargs)
        latency = time.perf_counter() - t0

        choice = resp.choices[0]
        msg = choice.message
        calls = []
        for tc in msg.tool_calls or []:
            try:
                args = json.loads(tc.function.arguments or "{}")
            except json.JSONDecodeError:
                args = {"_invalid_json": tc.function.arguments}
            calls.append(ToolCall(tc.id, tc.function.name, args))

        native: dict[str, Any] = {"role": "assistant", "content": msg.content or ""}
        if msg.tool_calls:
            native["tool_calls"] = [
                {
                    "id": tc.id,
                    "type": "function",
                    "function": {"name": tc.function.name, "arguments": tc.function.arguments},
                }
                for tc in msg.tool_calls
            ]
        u = resp.usage
        usage = Usage(
            input_tokens=getattr(u, "prompt_tokens", 0) or 0,
            output_tokens=getattr(u, "completion_tokens", 0) or 0,
        )
        stop = "tool_use" if calls else _STOP.get(choice.finish_reason or "", "other")
        return Completion(
            text=msg.content or "",
            tool_calls=calls,
            usage=usage,
            stop_reason=stop,
            assistant_message=native,
            model=resp.model or self.model,
            latency_s=latency,
            request_id=getattr(resp, "id", None),
        )
