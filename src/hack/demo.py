"""Demo-safe mode: replay recorded runs (shipped in demo/) as if they were happening live.

Needs no API key and no network, so a live demo cannot be broken by a dead key, a slow
connection or a rate limit. Replays are clearly marked (`replay_of` on run_start) and use run ids
starting with "demo-", which `reset` deletes.
"""

from __future__ import annotations

import json
import shutil
import threading
import time
import uuid
from typing import Any

from .config import Settings
from .tracing import Tracer

MAX_GAP_S = 2.0  # never wait longer than this between two replayed events


def scenes(settings: Settings) -> list[dict[str, Any]]:
    p = settings.demo_dir / "scenes.json"
    if not p.is_file():
        return []
    return [
        s
        for s in json.loads(p.read_text(encoding="utf-8"))
        if (settings.demo_dir / "runs" / s["id"] / "trace.jsonl").is_file()
    ]


def replay(settings: Settings, scene_id: str, speed: float = 3.0) -> dict[str, Any]:
    """Start replaying a scene in the background; returns the new run id immediately."""
    scene = next((s for s in scenes(settings) if s["id"] == scene_id), None)
    if scene is None:
        raise FileNotFoundError(scene_id)
    src = settings.demo_dir / "runs" / scene_id / "trace.jsonl"
    events = [json.loads(line) for line in src.read_text(encoding="utf-8").splitlines() if line]
    run_id = f"demo-{scene_id}-{uuid.uuid4().hex[:6]}"
    tracer = Tracer(settings.runs_dir, run_id)  # creates the run dir now, so polling sees it
    speed = min(max(speed, 0.5), 50.0)

    def play() -> None:
        last_t = 0.0
        for e in events:
            gap = max(0.0, float(e.get("t", last_t)) - last_t) / speed
            last_t = float(e.get("t", last_t))
            time.sleep(min(gap, MAX_GAP_S))
            data = {k: v for k, v in e.items() if k not in ("t", "type")}
            if e["type"] == "run_start":
                data["replay_of"] = scene["recorded_run"]
            tracer.event(e["type"], **data)

    threading.Thread(target=play, name=f"replay-{run_id}", daemon=True).start()
    return {"run_id": run_id, "scene": scene}


def reset(settings: Settings) -> int:
    """Delete all replayed demo runs. Real runs are never touched."""
    n = 0
    if settings.runs_dir.is_dir():
        for d in settings.runs_dir.iterdir():
            if d.is_dir() and d.name.startswith("demo-"):
                shutil.rmtree(d, ignore_errors=True)
                n += 1
    return n


def is_replay(trace: list[dict[str, Any]]) -> str | None:
    start = next((e for e in trace if e["type"] == "run_start"), {})
    return start.get("replay_of")
