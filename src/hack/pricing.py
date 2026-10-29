"""USD per 1M tokens. Estimates for budgets/comparisons, not billing. Source: Anthropic model table (2026-10).

Cache writes are assumed to cost 1.25x input. Models not listed are unpriced (0) unless overridden
via HACK_PRICE_INPUT_PER_MTOK / HACK_PRICE_OUTPUT_PER_MTOK; `is_priced` tells you which.
"""

from dataclasses import dataclass

from .llm.base import Usage


@dataclass(frozen=True)
class Price:
    input: float
    output: float
    cache_read: float


PRICES: dict[str, Price] = {
    "claude-fable-5-1": Price(10.0, 50.0, 0.25),
    "claude-fable-5": Price(10.0, 50.0, 0.25),
    "claude-opus-5-5": Price(4.0, 20.0, 0.20),
    "claude-opus-5": Price(5.0, 25.0, 0.50),
    "claude-opus-4-8": Price(5.0, 25.0, 0.50),
    "claude-sonnet-5-5": Price(2.0, 10.0, 0.20),
    "claude-sonnet-5": Price(2.0, 10.0, 0.20),
    "claude-sonnet-4-6": Price(3.0, 15.0, 0.30),
    "claude-haiku-5-5": Price(0.10, 0.50, 0.01),
    "claude-haiku-4-5": Price(1.0, 5.0, 0.10),
}


def lookup(
    model: str, override_in: float | None = None, override_out: float | None = None
) -> Price | None:
    if override_in is not None and override_out is not None:
        return Price(override_in, override_out, override_in * 0.1)
    return PRICES.get(model)


def is_priced(
    model: str, override_in: float | None = None, override_out: float | None = None
) -> bool:
    return lookup(model, override_in, override_out) is not None


def cost_usd(
    model: str,
    usage: Usage,
    override_in: float | None = None,
    override_out: float | None = None,
) -> float:
    p = lookup(model, override_in, override_out)
    if p is None:
        return 0.0
    return (
        usage.input_tokens * p.input
        + usage.cache_write_tokens * p.input * 1.25
        + usage.cache_read_tokens * p.cache_read
        + usage.output_tokens * p.output
    ) / 1_000_000
