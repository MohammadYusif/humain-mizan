from __future__ import annotations

import json
import time
import uuid
from pathlib import Path
from typing import Any


def new_run_id() -> str:
    return time.strftime("%Y%m%d-%H%M%S") + "-" + uuid.uuid4().hex[:6]


class Tracer:
    """Append-only JSONL trace: runs/<run_id>/trace.jsonl. One line per event."""

    def __init__(self, runs_dir: Path, run_id: str | None = None) -> None:
        self.run_id = run_id or new_run_id()
        self.dir = Path(runs_dir) / self.run_id
        self.dir.mkdir(parents=True, exist_ok=True)
        self.path = self.dir / "trace.jsonl"
        self._t0 = time.perf_counter()

    def event(self, type_: str, **data: Any) -> None:
        rec = {"t": round(time.perf_counter() - self._t0, 3), "type": type_, **data}
        with self.path.open("a", encoding="utf-8") as f:
            f.write(json.dumps(rec, default=str, ensure_ascii=False) + "\n")


def read_trace(runs_dir: Path, run_id: str) -> list[dict[str, Any]]:
    path = Path(runs_dir) / run_id / "trace.jsonl"
    if not path.is_file():
        raise FileNotFoundError(run_id)
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line]
