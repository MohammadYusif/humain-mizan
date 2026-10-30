# Contributing

## Set up

```bash
uv sync --all-extras
```
```bash
cd frontend && npm ci
```

Copy `.env.example` to `.env` and set `ANTHROPIC_API_KEY`. Tests never call the API.

## Before you push

Every change passes the same gate as CI:

```bash
uv run ruff check . && uv run ruff format --check .
```
```bash
uv run pytest -q
```
```bash
uv run python scripts/check_licenses.py
```
```bash
cd frontend && npm run typecheck && npm run lint && npm run build
```

- Work on a branch and open a pull request into `main`; CI must pass before it merges.
- One topic per pull request, with a test for each behaviour it adds or fixes.
- A change to how contracts are reviewed or routed is measured before it is claimed: add the case to
  `evals/` first, then run `uv run hack eval` and report the numbers, failures included.
- After adding a dependency, run the licence check and record it in `docs/LICENSES.md`. No GPL, AGPL,
  LGPL or SSPL code, models or datasets.

## What never goes in the repository

- Secrets: `.env`, API keys, password hashes, session keys. They live in `.env` locally and in the
  host's variables when deployed.
- The hackathon's challenge brief and data, which are HUMAIN Confidential Information (`data/`,
  `private/` and `docs/BRIEF.md` are ignored).
- Third-party real-contract texts: only their sources, checksums and labels are kept.

## Style

- Python 3.12, ruff, 100 columns. TypeScript with the repo's ESLint and Prettier settings.
- UI is built from shadcn/ui components and Tailwind tokens in `frontend/src/index.css`; copy is plain,
  sentence case, without em dashes.
- Commit messages say what changed and why, in the imperative.
