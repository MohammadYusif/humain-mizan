from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

from .config import get_settings
from .evals import format_summary, load_cases, rescore, run_eval, save_report
from .llm import build_provider
from .service import run_task


def _cmd_run(args: argparse.Namespace) -> int:
    s = get_settings()
    r = run_task(args.task, s)
    print(r.final_text)
    print(
        f"\n[{r.model}] {r.turns} turns, tools={r.tool_names}, tokens={r.usage.input_tokens}+{r.usage.output_tokens}, "
        f"${r.cost_usd:.4f}, {r.latency_s}s, stop={r.stop_reason}, trace=runs/{r.run_id}/trace.jsonl",
        file=sys.stderr,
    )
    return 0


def _cmd_eval(args: argparse.Namespace) -> int:
    s = get_settings()
    reports = []
    for model in args.model or [s.model]:
        provider = build_provider(s, model)
        rep = run_eval(load_cases(Path(args.cases)), s, provider=provider, workers=args.workers)
        # The limits a run had are part of its result (long contracts need more turns and budget).
        extra = {"max_turns": s.max_turns, "budget_usd": s.budget_usd, "effort": s.effort}
        if os.environ.get("HACK_PLAYBOOK"):
            extra["playbook"] = os.environ["HACK_PLAYBOOK"]  # a policy other than the default
        if args.suite:
            extra["suite"] = args.suite
        path = save_report(rep, Path(args.out), extra)
        print(f"{model}: saved {path}", file=sys.stderr)
        for c in rep.cases:
            if not c.passed:
                print(
                    f"  FAIL {c.id}: {c.error or [x for x in c.checks if not x.passed]}",
                    file=sys.stderr,
                )
        reports.append(rep.summary())
    print(format_summary(reports))
    return 0


def _cmd_rescore(args: argparse.Namespace) -> int:
    s = get_settings()
    rep = rescore(Path(args.report), load_cases(Path(args.cases)), s)
    path = save_report(rep, Path(args.out), {"rescored_from": Path(args.report).name})
    print(f"saved {path}", file=sys.stderr)
    for c in rep.cases:
        if not c.passed:
            print(f"  FAIL {c.id}: {[x for x in c.checks if not x.passed]}", file=sys.stderr)
    print(format_summary([rep.summary()]))
    return 0


def _cmd_compare(args: argparse.Namespace) -> int:
    print(
        format_summary(
            [json.loads(Path(p).read_text(encoding="utf-8"))["summary"] for p in args.reports]
        )
    )
    return 0


def _cmd_hash_password(args: argparse.Namespace) -> int:
    """Prints one HACK_AUTH_USERS entry. The password is typed at a prompt, never on the command line."""
    import getpass

    from .auth import hash_password

    pw = getpass.getpass(f"Password for {args.user}: ")
    if len(pw) < 12:
        print("Use at least 12 characters.", file=sys.stderr)
        return 1
    if getpass.getpass("Again: ") != pw:
        print("The passwords don't match.", file=sys.stderr)
        return 1
    print(f"{args.user}:{hash_password(pw)}")
    return 0


def _cmd_serve(args: argparse.Namespace) -> int:
    import uvicorn

    uvicorn.run("hack.api:app", host=args.host, port=args.port, reload=args.reload)
    return 0


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="hack")
    sub = p.add_subparsers(dest="cmd", required=True)

    r = sub.add_parser("run", help="run one task through the agent")
    r.add_argument("task")
    r.set_defaults(fn=_cmd_run)

    e = sub.add_parser("eval", help="run an eval file; repeat --model to compare models")
    e.add_argument("cases", nargs="?", default="evals/cases.jsonl")
    e.add_argument("--model", action="append")
    e.add_argument("--workers", type=int, default=4)
    e.add_argument("--out", default="evals/results")
    e.add_argument("--suite", help="label stored with the results, e.g. held-out")
    e.set_defaults(fn=_cmd_eval)

    rs = sub.add_parser(
        "rescore", help="re-grade a saved eval against current labels (no model calls)"
    )
    rs.add_argument("report")
    rs.add_argument("--cases", default="evals/cases.jsonl")
    rs.add_argument("--out", default="evals/results")
    rs.set_defaults(fn=_cmd_rescore)

    c = sub.add_parser("compare", help="print a table from saved eval result files")
    c.add_argument("reports", nargs="+")
    c.set_defaults(fn=_cmd_compare)

    h = sub.add_parser("hash-password", help="make a HACK_AUTH_USERS entry for sign-in")
    h.add_argument("user")
    h.set_defaults(fn=_cmd_hash_password)

    s = sub.add_parser("serve", help="start the API + demo UI")
    s.add_argument("--host", default="127.0.0.1")
    s.add_argument("--port", type=int, default=8000)
    s.add_argument("--reload", action="store_true")
    s.set_defaults(fn=_cmd_serve)

    args = p.parse_args(argv)
    return args.fn(args)


if __name__ == "__main__":
    raise SystemExit(main())
