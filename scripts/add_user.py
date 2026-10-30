"""Add (or replace) a sign-in account in .env. Run it yourself; the password is typed at a prompt.

    uv run python scripts/add_user.py mohammad legal
    uv run python scripts/add_user.py omar procurement   # a second account, another role

The role is optional. Only legal opens Restricted contracts and their reviews; once any account
has a role, an account without one opens only Public and Internal contracts.

Writes HACK_AUTH_USERS (name:scrypt-hash, comma-separated) and, the first time, a random
HACK_SECRET_KEY that signs the session cookies. Restart the server afterwards. Nothing is printed
but the account name: the password never leaves the prompt and the hash stays in .env.
"""

from __future__ import annotations

import getpass
import re
import secrets
import sys
from pathlib import Path

from hack.auth import hash_password, parse_users
from hack.challenge.policy import parse_roles

ENV = Path(__file__).resolve().parents[1] / ".env"


def main(user: str, role: str | None = None) -> int:
    if not re.fullmatch(r"[A-Za-z0-9_.-]{2,40}", user):
        print(
            "Use 2-40 letters, digits, dots, dashes or underscores for the name.", file=sys.stderr
        )
        return 1
    pw = getpass.getpass(f"Password for {user} (12+ characters): ")
    if len(pw) < 12:
        print("Use at least 12 characters.", file=sys.stderr)
        return 1
    if getpass.getpass("Again: ") != pw:
        print("The passwords don't match.", file=sys.stderr)
        return 1
    lines = ENV.read_text(encoding="utf-8").splitlines() if ENV.exists() else []
    current = next((ln.split("=", 1)[1] for ln in lines if ln.startswith("HACK_AUTH_USERS=")), "")
    users = parse_users(current)
    users[user] = hash_password(pw)
    spec = ",".join(f"{n}:{h}" for n, h in users.items())
    lines = [ln for ln in lines if not ln.startswith("HACK_AUTH_USERS=")]
    lines.append(f"HACK_AUTH_USERS={spec}")
    if role:
        cur = next((ln.split("=", 1)[1] for ln in lines if ln.startswith("HACK_AUTH_ROLES=")), "")
        roles = parse_roles(cur)
        roles[user] = role.lower()
        lines = [ln for ln in lines if not ln.startswith("HACK_AUTH_ROLES=")]
        lines.append("HACK_AUTH_ROLES=" + ",".join(f"{n}:{r}" for n, r in roles.items()))
    if not any(ln.startswith("HACK_SECRET_KEY=") for ln in lines):
        lines.append(f"HACK_SECRET_KEY={secrets.token_hex(32)}")
    ENV.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(
        f"Saved {user}{f' ({role})' if role else ''}. Accounts: {', '.join(users)}. Restart the server."
    )
    return 0


if __name__ == "__main__":
    if len(sys.argv) not in (2, 3):
        print(__doc__)
        sys.exit(2)
    sys.exit(main(sys.argv[1], sys.argv[2] if len(sys.argv) == 3 else None))
