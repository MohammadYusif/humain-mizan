import json

from fastapi.testclient import TestClient

from hack.api import create_app
from hack.config import Settings
from hack.evals import run_eval
from hack.llm.base import ToolCall
from hack.llm.fake import FakeProvider, call_tools, text
from hack.service import run_task
from helpers import example_registry


def settings(tmp_path, **kw) -> Settings:
    return Settings(provider="fake", runs_dir=tmp_path / "runs", web_dir=tmp_path, **kw)


def run(task, s, provider):
    return run_task(task, s, provider=provider, registry=example_registry(s))


def test_tool_loop_runs_calculator(tmp_path):
    s = settings(tmp_path)
    p = FakeProvider([call_tools(("t1", "calculator", {"expression": "(17+25)*3"})), text("126")])
    r = run("calc", s, p)
    assert r.final_text == "126"
    assert r.tool_names == ["calculator"]
    assert r.stop_reason == "end_turn"
    assert r.turns == 2
    assert "126" in str(p.calls[1]["messages"][-1])  # the tool result reached the model


def test_write_tool_is_dry_run_by_default(tmp_path):
    res = example_registry(settings(tmp_path)).execute(
        ToolCall("x", "restart_service", {"service": "db"})
    )
    assert "dry-run" in res.content and not res.is_error
    ok = example_registry(settings(tmp_path, approve_writes=True))
    assert "restarted" in ok.execute(ToolCall("x", "restart_service", {"service": "db"})).content


def test_bad_arguments_and_unknown_tool_return_errors(tmp_path):
    reg = example_registry(settings(tmp_path))
    assert reg.execute(ToolCall("a", "calculator", {})).is_error
    assert reg.execute(ToolCall("b", "nope", {})).is_error
    assert reg.execute(ToolCall("c", "calculator", {"expression": "__import__('os')"})).is_error


def test_budget_and_turn_caps(tmp_path):
    loop = call_tools(("t", "calculator", {"expression": "1+1"}))
    s = settings(tmp_path, max_turns=3)
    r = run("x", s, FakeProvider([loop]))
    assert r.stop_reason == "max_turns" and r.turns == 3
    s = settings(
        tmp_path, budget_usd=0.0001, price_input_per_mtok=1000.0, price_output_per_mtok=1000.0
    )
    assert run("x", s, FakeProvider([loop])).stop_reason == "budget_exceeded"


def test_trace_written(tmp_path):
    s = settings(tmp_path)
    r = run("hi", s, FakeProvider([text("hello")]))
    lines = (tmp_path / "runs" / r.run_id / "trace.jsonl").read_text().splitlines()
    assert [json.loads(x)["type"] for x in lines] == ["run_start", "llm_call", "run_end"]


def test_eval_harness(tmp_path):
    s = settings(tmp_path)
    p = FakeProvider([call_tools(("t1", "calculator", {"expression": "2*21"})), text("42")])
    cases = [
        {
            "id": "a",
            "input": "2*21",
            "checks": [
                {"type": "contains", "value": "42"},
                {"type": "tool_called", "value": "calculator"},
            ],
        }
    ]
    rep = run_eval(cases, s, provider=p, workers=1, registry_factory=example_registry)
    assert rep.summary()["pass_rate"] == 1.0
    bad = [{"id": "b", "input": "x", "checks": [{"type": "contains", "value": "nope"}]}]
    rep = run_eval(bad, s, provider=FakeProvider([text("hi")]), workers=1)
    assert rep.summary()["pass_rate"] == 0.0


def test_api(tmp_path):
    app = create_app(settings(tmp_path), provider_factory=lambda: FakeProvider([text("pong")]))
    c = TestClient(app)
    assert c.get("/healthz").json()["status"] == "ok"
    body = c.post("/run", json={"task": "ping"}).json()
    assert body["final_text"] == "pong"
    assert c.get(f"/runs/{body['run_id']}/trace").status_code == 200
    assert c.get("/runs/..%2F..%2Fetc/trace").status_code in (400, 404)
    assert c.get("/runs/does-not-exist/trace").status_code == 404
