"""Sign-in gate for a deployed Mizan: closed by default once users are configured."""

import pytest
from fastapi.testclient import TestClient

from hack import auth as A
from hack.api import create_app
from test_workflow import settings


@pytest.fixture
def client(tmp_path):
    web = tmp_path / "web"
    (web / "assets").mkdir(parents=True)
    (web / "index.html").write_text("<!doctype html><title>Mizan</title>")
    (web / "assets" / "app.js").write_text("console.log('ui')")
    s = settings(
        tmp_path,
        auth_users=f"lawyer:{A.hash_password('correct horse battery')}",
        secret_key="test-secret-key",
        require_auth=True,
    )
    s = s.model_copy(update={"web_dir": web})
    return TestClient(create_app(s))


def test_everything_but_the_sign_in_page_needs_a_session(client):
    for path in ("/runs", "/contracts", "/inbox", "/evals", "/playbook", "/insights", "/batches"):
        assert client.get(path).status_code == 401, path
    assert client.post("/run", json={"task": "x"}).status_code == 401
    assert client.get("/no-such-api").status_code == 401  # unknown paths fail closed
    # what the sign-in page itself needs is open, and holds no data
    assert client.get("/").status_code == 200
    assert client.get("/assets/app.js").status_code == 200
    assert client.get("/healthz").status_code == 200
    assert client.get("/auth/me").status_code == 401


def test_sign_in_sets_a_session_and_sign_out_ends_it(client):
    r = client.post("/auth/login", json={"username": "lawyer", "password": "wrong password!"})
    assert r.status_code == 401 and "don't match" in r.json()["detail"]
    r = client.post("/auth/login", json={"username": "lawyer", "password": "correct horse battery"})
    assert r.status_code == 200 and "httponly" in r.headers["set-cookie"].lower()
    assert client.get("/auth/me").json() == {"user": "lawyer", "auth": True, "role": None}
    assert client.get("/runs").status_code == 200
    client.post("/auth/logout")
    assert client.get("/runs").status_code == 401


def test_forged_or_expired_sessions_are_rejected(client, monkeypatch):
    client.cookies.set(A.COOKIE, "eyJ1IjogImxhd3llciIsICJleHAiOiA5OTk5OTk5OTk5fQ.forged")
    assert client.get("/runs").status_code == 401
    good = A.Auth({"lawyer": A.hash_password("x" * 12)}, "k", True)
    token = good.token_for("lawyer")
    assert good.user_of(token) == "lawyer"
    assert A.Auth({"lawyer": "h"}, "other-key", True).user_of(token) is None  # wrong key
    monkeypatch.setattr(A.time, "time", lambda: 10**10)
    assert good.user_of(token) is None  # expired


def test_repeated_failures_are_slowed_down(client):
    for _ in range(A.MAX_FAILURES):
        client.post("/auth/login", json={"username": "lawyer", "password": "guess"})
    r = client.post("/auth/login", json={"username": "lawyer", "password": "correct horse battery"})
    assert r.status_code == 429


def test_a_deployment_cannot_start_open_by_mistake(tmp_path):
    with pytest.raises(RuntimeError, match="no users"):
        create_app(settings(tmp_path, require_auth=True))
    with pytest.raises(RuntimeError, match="HACK_SECRET_KEY"):
        create_app(settings(tmp_path, auth_users=f"a:{A.hash_password('y' * 12)}"))
    # local development: no users, no gate
    assert TestClient(create_app(settings(tmp_path))).get("/auth/me").json() == {
        "user": None,
        "auth": False,
    }
