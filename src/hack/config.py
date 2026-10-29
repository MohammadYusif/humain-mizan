from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="HACK_", extra="ignore")

    provider: str = "anthropic"
    model: str = "claude-opus-5-5"
    effort: str = "medium"
    max_tokens: int = 16000
    max_turns: int = 20
    budget_usd: float = 5.0
    approve_writes: bool = False
    judge_model: str = "claude-sonnet-5-5"
    runs_dir: Path = Path("runs")
    web_dir: Path = Path("web")
    contracts_dir: Path = Path("evals/contracts")
    # User uploads may be confidential: kept under data/ (git- and docker-ignored).
    uploads_dir: Path = Path("data/uploads")
    results_dir: Path = Path("evals/results")
    # Curated result files shown on the Proof screen (tracked in git, shipped in the image).
    proof_dir: Path = Path("evals/proof")
    # Assumptions behind the "hours saved" estimate, shown next to the number in the UI.
    manual_minutes_per_contract: float = 60.0
    legal_minutes_per_escalation: float = 15.0

    openai_base_url: str = "http://localhost:11434/v1"
    openai_api_key: str = "none"
    price_input_per_mtok: float | None = None
    price_output_per_mtok: float | None = None

    # Not HACK_-prefixed: the standard variable, but read from .env too (the SDK only sees os.environ).
    anthropic_api_key: str | None = Field(default=None, validation_alias="ANTHROPIC_API_KEY")


@lru_cache
def get_settings() -> Settings:
    return Settings()
