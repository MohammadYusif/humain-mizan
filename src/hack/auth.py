"""Sign-in for a deployed Mizan.

Off when no users are configured (local development). A deployment sets HACK_AUTH_USERS and
HACK_REQUIRE_AUTH=true, so it refuses to start rather than run open by accident.

- Users: HACK_AUTH_USERS="name:scrypt$<salt>$<hash>,other:..."; make a hash with
  `uv run hack hash-password` (the password is typed at a prompt, never on the command line).
- Sessions: an HMAC-signed cookie (user, expiry) keyed by HACK_SECRET_KEY; HttpOnly, SameSite=Lax,
  Secure on HTTPS. Nothing is stored server-side.
- Failed sign-ins are limited per client address.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import secrets
import time
from collections import defaultdict, deque

COOKIE = "mizan_session"
SESSION_SECONDS = 12 * 3600
MAX_FAILURES, FAILURE_WINDOW_S = 8, 300
_N, _R, _P = 2**14, 8, 1  # scrypt cost: ~50 ms per check


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=_N, r=_R, p=_P, dklen=32)
    return f"scrypt${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        algo, salt, digest = stored.split("$")
        if algo != "scrypt":
            return False
        got = hashlib.scrypt(
            password.encode(), salt=bytes.fromhex(salt), n=_N, r=_R, p=_P, dklen=32
        )
    except ValueError:
        return False
    return hmac.compare_digest(got.hex(), digest)


def parse_users(spec: str | None) -> dict[str, str]:
    users: dict[str, str] = {}
    for part in (spec or "").split(","):
        name, _, digest = part.strip().partition(":")
        if name.strip() and digest.strip():
            users[name.strip()] = digest.strip()
    return users


# Checked when the user name is unknown, so a wrong name takes as long as a wrong password.
_DUMMY = hash_password(secrets.token_hex(8))


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _unb64(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


class Auth:
    def __init__(self, users: dict[str, str], secret: str | None, require: bool) -> None:
        if require and not users:
            raise RuntimeError("HACK_REQUIRE_AUTH is set but HACK_AUTH_USERS has no users")
        if users and not secret:
            raise RuntimeError("HACK_SECRET_KEY must be set when sign-in is on")
        self.users = users
        self.enabled = bool(users)
        self._key = (secret or "").encode()
        self._failures: dict[str, deque[float]] = defaultdict(deque)

    def _sig(self, payload: str) -> str:
        return _b64(hmac.new(self._key, payload.encode(), hashlib.sha256).digest())

    def token_for(self, user: str) -> str:
        payload = _b64(json.dumps({"u": user, "exp": int(time.time()) + SESSION_SECONDS}).encode())
        return f"{payload}.{self._sig(payload)}"

    def user_of(self, token: str | None) -> str | None:
        if not token or "." not in token:
            return None
        payload, sig = token.rsplit(".", 1)
        if not hmac.compare_digest(sig, self._sig(payload)):
            return None
        try:
            data = json.loads(_unb64(payload))
        except ValueError:
            return None
        user = data.get("u")
        if data.get("exp", 0) < time.time() or user not in self.users:
            return None  # expired, or the user was removed since
        return user

    def blocked(self, client: str) -> bool:
        q, now = self._failures[client], time.time()
        while q and q[0] < now - FAILURE_WINDOW_S:
            q.popleft()
        return len(q) >= MAX_FAILURES

    def check(self, client: str, user: str, password: str) -> bool:
        ok = verify_password(password, self.users.get(user, _DUMMY)) and user in self.users
        if not ok:
            self._failures[client].append(time.time())
        return ok
