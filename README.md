# Mizan — an agent that owns contract review end to end

HUMAIN Future AI Builders Hackathon, Challenge 3 (Autonomous Enterprise). Mizan reads a contract (Arabic, English or bilingual), checks every clause against the company playbook, and **routes** it: approve, negotiate (redline sent to the counterparty) or escalate (a lawyer decides, with the exact question). The route is computed by code, not chosen by the model.

```bash
cp .env.example .env              # add ANTHROPIC_API_KEY
uv sync --all-extras
cd frontend && npm install && npm run build && cd ..
uv run hack serve                 # http://127.0.0.1:8000
```

Or with Docker (builds the UI too): `docker compose up --build` → http://localhost:8000.

## What it does
- **Review**: pick a sample or **bring your own contract** (.docx, .pdf with a text layer, .txt/.md, or paste). Live trace, findings with verbatim quotes and redlines, memo, route.
- **Queue + Inbox**: run many contracts in parallel; the agent sends negotiation redlines itself (or waits for approval), and only escalations reach a lawyer's inbox. An estimate of hours saved is shown with its assumptions.
- **Proof**: eval results per model (route accuracy, false auto-approve, recall/precision, latency, cost), including the local model.
- **Held-out test**: 12 contracts written blind (never used for tuning) — Claude Sonnet 5.5 routes 100% correctly with 0 wrong approvals.
- **Guided demo**: four recorded runs replay as if live, with no API key or network (demo-safe).
- **Insights (learning loop)**: lawyers' decisions become proposed playbook amendments; a human approves them; red flags and critical rules never relax.
- **Word exports**: a redline with real tracked changes and comments (Arabic right-to-left) and a decision memo.

## Why the route can be trusted
- Severity and routing are code (`src/hack/challenge/review.py`); a critical finding never approves.
- Approval requires evidence of coverage: every page read, every clause typed, liability and governing-law clauses present, nothing unclear.
- **Two detectors**: deterministic red-flag patterns (Arabic + English, `tripwires.py`) run independently of the model. Critical flags always escalate; others must be recorded as findings or cleared with a verbatim quote, on record.
- Quotes must appear verbatim in the clause; instructions inside a contract force escalation; outward sends need approval.

## Develop
```bash
uv run pytest                                  # 60 tests, no API calls
uv run hack run "Review contract saas-en-01 and route it."
uv run hack eval --model claude-sonnet-5-5     # 12 labelled contracts -> evals/results/
uv run hack rescore evals/results/<file>.json  # re-grade saved traces against current labels
cd frontend && npm run dev                     # UI on :5173, proxies the API on :8000
```
Local model ("sovereign mode"): `HACK_PROVIDER=openai_compat HACK_MODEL=qwen3:14b` with Ollama (`docker compose --profile local up`).

Results: [docs/RESULTS.md](docs/RESULTS.md). Spec: [docs/SPEC.md](docs/SPEC.md). Third-party licences: [docs/LICENSES.md](docs/LICENSES.md). Playbook rules are illustrative demo defaults, not legal advice.
