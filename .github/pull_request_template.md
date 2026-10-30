## What and why

<!-- What changes, and the reason for it. Link the issue if there is one. -->

## How it was checked

- [ ] `uv run ruff check . && uv run ruff format --check .`
- [ ] `uv run pytest -q` (a test covers the new or fixed behaviour)
- [ ] `cd frontend && npm run typecheck && npm run lint && npm run build` (if the UI changed)
- [ ] Review or routing changed: eval numbers before and after, failures included
- [ ] New dependency: licence checked and recorded in `docs/LICENSES.md`

## Nothing that must not ship

- [ ] No secrets, no challenge brief or `data/`, no third-party contract texts
