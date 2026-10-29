# Spec: Autonomous Contract Review Agent (Challenge 3)

Status: DRAFT for approval. Judging criteria/deadline still unknown (see docs/BRIEF.md); update the mapping table when known.

## Problem and user
In-house legal/procurement teams review every inbound vendor/customer contract by hand: read 10-40 pages, compare against the company playbook, mark up, brief the business, chase approvals. Most contracts are routine; the hours go on reading, not judgement. Users: a legal/procurement team at a Saudi enterprise; contracts in Arabic, English or bilingual.

## What "owning the process" means
The agent takes a contract from intake to a routed decision with no human in the loop for routine cases, and a precise, evidence-backed escalation (not a vague "please review") for the rest.

```
intake -> parse + clause split (AR/EN) -> classify clauses -> check each vs playbook
  -> risk score (deterministic) -> redlines w/ fallback language -> memo for the business
  -> ROUTE: approve | send redline to counterparty | escalate to legal with the specific question
  -> audit log (every step, evidence quote, rule id)
```

Autonomy boundary (the part judges will probe):
| Situation | Agent action |
|---|---|
| No findings above "minor" | Auto-approve, memo, log |
| Fixable deviations with playbook fallback language | Generate redline, send to counterparty (dry-run unless approved) |
| Critical finding, unknown clause type, low confidence, or conflicting AR/EN versions | Escalate to legal with quote + rule + question; never auto-approve |

## Core flow (the demo)
Upload a contract -> live trace -> findings table with quoted evidence -> redline + memo -> route decision -> audit log. Then a batch of 12 contracts with the metrics table.

## Architecture (reuses the existing `hack` kit; challenge code only in `src/hack/challenge/`)
- LLM does reading/judgement; code does arithmetic, risk scoring and routing thresholds (deterministic, testable).
- Tools (pydantic-typed; `risk="write"` dry-runs unless `HACK_APPROVE_WRITES=true`):
  | Tool | Risk | Purpose |
  |---|---|---|
  | `load_contract(doc_id)` | read | text split into numbered clauses (`c1..cN`), language per clause |
  | `get_playbook(clause_type)` / `list_playbook()` | read | rules: required position, acceptable fallback, red lines, severity |
  | `find_precedent(query)` | read | previously approved wording (synthetic corpus) |
  | `record_finding(clause_id, rule_id, severity, quote, issue, redline)` | read (internal state) | structured finding; validates the quote really occurs in the clause |
  | `score_contract()` | read | deterministic risk score + recommended route from findings |
  | `render_outputs(doc_id)` | read (writes to run dir) | redline.md, memo.md, findings.json |
  | `send_to_counterparty(doc_id, message)` | **write** | dry-run by default |
  | `escalate_to_legal(doc_id, question)` | **write** | dry-run by default |
- Guardrails: quote-must-exist check (kills hallucinated findings), critical findings can never route to approve (enforced in `score_contract`, not in the prompt), turn cap, USD budget, full JSONL trace, disclaimer that output is decision support, not legal advice.
- "Sovereign mode": same pipeline on a local model via Ollama (`HACK_PROVIDER=openai_compat`), so no contract text leaves the machine. Eval table compares Claude vs local on identical cases (accuracy, latency, cost).

## Playbook (configurable, `src/hack/challenge/playbook.yaml` or py)
Illustrative rules to validate with a domain expert: liability cap, indemnity scope, termination for convenience, auto-renewal/notice, payment terms, IP ownership, confidentiality term, governing law/jurisdiction & dispute forum (KSA courts / arbitration), data protection and data residency, interest/late-fee wording, non-compete/exclusivity, language precedence (Arabic vs English), assignment, force majeure. Each rule: id, clause type, severity (minor/major/critical), required position, accepted fallback, detection hint. NOT legal advice; positions are demo defaults.

## Data (all synthetic, ours, tracked in `evals/contracts/`)
- 12 contracts: 6 English, 6 Arabic (some bilingual), 3-8 clauses with seeded issues each, plus 2 clean ones and 2 "trap" cases (looks risky, is fine; missing clause entirely).
- `labels.json`: for each contract the seeded issues (clause, rule id, severity) and the correct route.
- No real or HUMAIN-provided confidential contracts committed; if HUMAIN provides data, it goes in `data/` (git-ignored).

## Success metrics (measured by `hack eval`; baseline = human estimate, labelled as an assumption)
| Metric | Target |
|---|---|
| Seeded-issue recall (critical + major) | >= 90% |
| Finding precision (quote verified, rule correct) | >= 85% |
| Route accuracy | >= 90% |
| **False auto-approve rate** (contract with critical issue routed to approve) | **0** |
| Arabic vs English recall gap | <= 10 pts |
| Time per contract | < 2 min vs ~60 min manual (assumption) |
| Cost per contract (Claude) / local | report both |

## Judging criteria -> our answer (placeholders until criteria are known)
| Likely criterion | Our answer |
|---|---|
| Autonomy / end-to-end ownership | Intake -> routed decision, human only on escalations |
| Real business value | Hours saved per contract, measured |
| Technical depth | Tool loop, deterministic scoring, quote verification, evals, local model mode |
| Reliability and safety | Zero false auto-approve, dry-run writes, audit log |
| Saudi relevance | Arabic/bilingual contracts, KSA governing law/forum rules, sovereign (local) mode |
| Demo quality | Live trace + metrics table + 3 min video |

## Scope for ~24h
- P0 (first ~6h): playbook + parser + tools + agent prompt; CLI and UI on 2 EN contracts end to end.
- P1: Arabic contracts, 12-case eval with labels, tune to targets, DOCX/PDF intake (`python-docx` MIT, `pypdf` BSD).
- P2: local-model comparison, batch run + results table, cost/latency numbers.
- P3: polish, README, architecture diagram, demo video, SUBMISSION.md checklist.
- Out of scope: real email/e-signature/CRM integration (mocked as dry-run tools), OCR of scanned PDFs, any claim of legal advice.

## Risks and fallbacks
- Arabic quality on local model is weak -> report honestly; keep Claude as the headline, local as the sovereign option.
- Over-escalation (agent never decides) -> tune thresholds against the route-accuracy metric.
- Playbook accuracy for KSA law -> label as configurable demo defaults, say a lawyer validates before production.
- Time -> P0 vertical slice first; cut P2/P3 items, never the false-auto-approve check.

## Open questions
- Judging criteria, deadline, submission format, team size; any provided data/APIs.
