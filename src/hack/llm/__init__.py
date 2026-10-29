from ..config import Settings
from .base import Completion, Provider, ToolCall, ToolResult, ToolSpec, Usage

__all__ = [
    "Completion",
    "Provider",
    "ToolCall",
    "ToolResult",
    "ToolSpec",
    "Usage",
    "build_provider",
]


def build_provider(settings: Settings, model: str | None = None) -> Provider:
    model = model or settings.model
    if settings.provider == "anthropic":
        from .anthropic_provider import AnthropicProvider

        return AnthropicProvider(model, settings.effort, settings.anthropic_api_key)
    if settings.provider == "openai_compat":
        from .openai_provider import OpenAICompatProvider

        return OpenAICompatProvider(model, settings.openai_base_url, settings.openai_api_key)
    if settings.provider == "fake":
        from .fake import FakeProvider

        return FakeProvider()
    raise ValueError(f"unknown provider {settings.provider!r} (anthropic | openai_compat | fake)")
