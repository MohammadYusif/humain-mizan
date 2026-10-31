# Private deployment (Railway)

Mizan is deployed behind its own sign-in page: without a session the only thing anyone sees is the
sign-in screen, and every data endpoint answers 401. The code is public (with the organisers'
approval); the running app, its API key and anything uploaded to it are not. Invite people by creating a
user for each; share the address and their password privately.

What is and is not in the deployment:
- In it: the app, the sample and held-out contracts, the recorded demo, the eval results (Proof).
- Not in it: the challenge brief and any HUMAIN data (`data/`, `docs/` are excluded from the image), the
  third-party real-contract texts (`data/real/`), and `.env`. Contracts people upload are stored on the
  service's volume; reviews call the Anthropic API with your key, so only invite people you trust.

## Steps

Prerequisites: the Railway CLI, signed in (`railway whoami`).

```bash
railway init --name mizan
```
```bash
railway add --service mizan
```
```bash
uv run python scripts/railway_setup.py --service mizan --user mohammad
```
The setup script asks for each user's password, then sets the variables (secrets via stdin, never on
the command line), and adds a volume at `/app/data`. It does not deploy. Then, when you want it live:

```bash
railway up --service mizan --detach
```
```bash
railway domain --service mizan
```

Open the address `railway domain` prints and sign in. The first build takes a few minutes (UI build,
Python install, OCR models).

Region: Railway deploys to its default region; for lower latency from Saudi Arabia pick EU West
(Amsterdam) under the service's Settings, then redeploy.

## Users

Add or change users by regenerating the list (the setup script does this), or by hand:

```bash
uv run hack hash-password judge
```
The command asks for the password and prints `judge:scrypt$...`. Set `HACK_AUTH_USERS` to a
comma-separated list of these entries (`railway variable set HACK_AUTH_USERS --stdin --service mizan`,
then paste and press Ctrl+Z, Enter on Windows or Ctrl+D elsewhere). Removing a user signs them out at
their next request.

## How the gate works

- `HACK_REQUIRE_AUTH=true`: the app refuses to start if no users are configured, so it can never run
  open by accident. Locally, with no users set, sign-in is off.
- Passwords are stored only as scrypt hashes. Sessions are HMAC-signed, HttpOnly, SameSite=Lax cookies,
  Secure over HTTPS, valid for 12 hours; `HACK_SECRET_KEY` signs them (changing it signs everyone out).
- Failed sign-ins are limited to 8 per 5 minutes per address.
- The container starts as root only to hand the volume to the unprivileged `app` user, then runs as it.
- Pages carry `noindex, nofollow`.

## Taking it down

```bash
railway down --service mizan
```
This removes the latest deployment; `railway delete` removes the whole project (and its volume, with any
uploaded contracts).
