"""Configure the linked Railway service for a private Mizan deployment. It does NOT deploy.

Run from the repo root after `railway init --name mizan` and `railway add --service mizan`:

    uv run python scripts/railway_setup.py --service mizan --user mohammad --user judge

For each user you are asked for a password (at least 12 characters; never shown or stored, only
its scrypt hash goes to Railway). Secrets are sent with `railway variable set KEY --stdin`, so they
never appear on a command line or in shell history. The Anthropic key is read from ANTHROPIC_API_KEY
in the environment or in .env. Then deploy when you are ready: `railway up --service mizan --detach`.
"""

from __future__ import annotations

import argparse
import getpass
import json
import os
import secrets
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from hack.auth import hash_password  # noqa: E402

# Non-secret settings for the deployment (see src/hack/config.py).
SETTINGS = {
    "HACK_PROVIDER": "anthropic",
    "HACK_MODEL": "claude-sonnet-5-5",
    "HACK_EFFORT": "medium",
    "HACK_BUDGET_USD": "4",
    "HACK_MAX_TURNS": "40",
    "HACK_REQUIRE_AUTH": "true",  # refuse to start without users: never open by accident
    "HACK_RUNS_DIR": "/app/data/runs",  # runs, uploads and the learning store live on the volume
}
MOUNT = "/app/data"


def railway(*args: str, stdin: str | None = None) -> str:
    exe = shutil.which("railway")
    if exe is None:
        sys.exit("The Railway CLI is not installed (npm i -g @railway/cli).")
    r = subprocess.run([exe, *args], input=stdin, text=True, capture_output=True)
    if r.returncode != 0:
        sys.exit(f"railway {' '.join(args[:2])} failed: {r.stderr.strip() or r.stdout.strip()}")
    return r.stdout


def set_var(service: str, key: str, value: str) -> None:
    railway("variable", "set", key, "--stdin", "--skip-deploys", "--service", service, stdin=value)
    print(f"  set {key}")


def anthropic_key() -> str:
    if key := os.environ.get("ANTHROPIC_API_KEY"):
        return key
    env = ROOT / ".env"
    if env.is_file():
        for line in env.read_text(encoding="utf-8").splitlines():
            if line.startswith("ANTHROPIC_API_KEY="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    sys.exit("ANTHROPIC_API_KEY is not set in the environment or in .env.")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--service", default="mizan")
    ap.add_argument("--user", action="append", required=True, help="a sign-in user name (repeat)")
    args = ap.parse_args()

    users = []
    for name in args.user:
        pw = getpass.getpass(f"Password for {name}: ")
        if len(pw) < 12:
            sys.exit("Use at least 12 characters.")
        if getpass.getpass("Again: ") != pw:
            sys.exit("The passwords don't match.")
        users.append(f"{name}:{hash_password(pw)}")

    print(f"Configuring Railway service {args.service!r} (nothing is deployed):")
    set_var(args.service, "ANTHROPIC_API_KEY", anthropic_key())
    set_var(args.service, "HACK_SECRET_KEY", secrets.token_urlsafe(48))
    set_var(args.service, "HACK_AUTH_USERS", ",".join(users))
    for key, value in SETTINGS.items():
        set_var(args.service, key, value)

    volumes = json.loads(railway("volume", "list", "--json", "--service", args.service) or "[]")
    if not any(
        MOUNT in json.dumps(v) for v in (volumes if isinstance(volumes, list) else [volumes])
    ):
        railway("volume", "add", "--mount-path", MOUNT, "--service", args.service)
        print(f"  added a volume at {MOUNT}")
    else:
        print(f"  volume at {MOUNT} already there")

    print("\nReady. When you want it live:")
    print(f"  railway up --service {args.service} --detach")
    print(f"  railway domain --service {args.service}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
