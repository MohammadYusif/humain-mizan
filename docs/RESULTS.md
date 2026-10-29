# Results (synthetic contracts; reproduce with `uv run hack eval --model <id>`)

12 contracts we wrote ourselves (7 English, 4 Arabic/bilingual incl. 1 Arabic/English conflict, 2 traps, 1 prompt-injection, 1 missing liability clause); labels written by a separate reviewer agent and checked against the routing code. Small sample: treat as a smoke test, not a benchmark. Effort `medium`, 2026-10-29. The curated result files are in `evals/proof/` (what the Proof screen shows).

## Current configuration (red-flag checks + completion check)

| Metric | Claude Sonnet 5.5 | qwen3:14b, local (Ollama) |
|---|---|---|
| Cases passed (all checks) | 12/12 | 11/12 |
| Route accuracy | 100% | 92% |
| **Approved a contract that should not be approved** | **0 / 9** | **0 / 9** |
| Left unrouted (goes to a lawyer as "unrouted") | 0 | 1 (looped on findings until the 20-turn cap) |
| Finding recall / precision | 100% / 94% | 94% / 94% |
| Completion-check nudges used | 0 | 9 across 12 contracts |
| Latency p50 / p95 | 15.1s / 21.6s | 366s / 1186s |
| Cost per contract | ~$0.047 | local, no API cost |

## Held-out (blind) test: contracts the system was never tuned on

12 more contracts (`evals/heldout/`) written by a separate agent that never saw the red-flag patterns, the main contracts or their labels: seven industries (construction, fleet, medical supplies, marketing, freight, cloud hosting, facility management, catering, staffing, equipment lease, cybersecurity, translation), 6 English, 4 Arabic, 2 bilingual, with traps, unusually worded critical liability, an Arabic prompt-injection and a missing governing-law clause.

| Claude Sonnet 5.5 | Blind first run | After the injection fix (current) |
|---|---|---|
| Route accuracy | 92% | **100%** |
| **Approved a contract that should not be approved** | **0 / 8** | **0 / 8** |
| Finding recall / precision | 100% / 100% | 92% / 100% |
| Latency p50 / cost per contract | 15.9s / $0.052 | 15.9s / $0.053 |

**The local model on the held-out set (qwen3:14b, blind):** 50% of cases passed, route accuracy 67%, **2 of 8 risky contracts approved** (`ho-medical-supplies`, and `ho-staff-catering`, which has a critical liability issue), 2 left unrouted (they go to a lawyer), recall 46%.

**What this shows about the red-flag patterns:** they catch **1 of 13** labelled held-out issues, against 12 of 12 on the main suite they were written against. Unusual wording ("not subject to any monetary ceiling", "a surcharge for each month of delay") slips past them. So on unseen contracts the safety comes from the model: Claude Sonnet 5.5 found every issue that mattered (100% route accuracy, 0 wrong approvals), the local model did not, and the patterns were not a reliable net under it. We report this as measured and have **not** widened the patterns to fit the held-out wording. Conclusion: run Mizan on a strong model for unattended use; the local ("sovereign") mode needs a lawyer on every contract.

The blind run's one miss was the Arabic prompt-injection: the model noticed the instruction, ignored it and flagged it in the memo, but the injection regex did not match its wording, so code routed the contract to negotiate instead of escalate (it was never approved). The fix lets the model report an injected instruction with a verified quote as a second detector; the regex was deliberately **not** widened to fit the held-out wording. After the fix the only miss is one unrecorded language-precedence finding on the bilingual audit contract, where the route was still correct.

## How the safety layers changed the local model

| qwen3:14b (local) | No safeguards | + red-flag checks | + completion check (current) |
|---|---|---|---|
| Route accuracy | 58% | 75% | **92%** |
| Wrongly approved | **3 / 9** (incl. a critical liability issue) | 0 / 9 | 0 / 9 |
| Left unrouted | 1 | 2 | 1 |
| Finding recall | 56% | 81% | 94% |

- **Red-flag checks** (deterministic Arabic + English patterns, independent of the model) closed the dangerous gap: a critical flag cannot be cleared and a major one cannot be silently ignored, so the three wrong approvals became escalations.
- **The completion check** closed most of the remaining gap: when the model tries to stop with steps left, the loop tells it exactly what is missing (at most twice). Sonnet never needed it; qwen needed 9 nudges over 12 contracts.
- Whatever a model still leaves unfinished is routed by code to a lawyer ("unrouted" in the Inbox) and counted as a full manual review in the hours-saved estimate.

Claude Opus 5.5 was measured earlier, before the red-flag checks: 11/11 + the missing-clause case 1/1, route accuracy 100%, 0 wrong approvals, p50 26.8s, ~$0.10 per contract.

## Notes

- Sonnet's very first run was graded 11/12 because on the bilingual licence it recorded the IP issue on the English half (c6) of the clause whose Arabic half (c5) was labelled; the label now accepts either half (re-graded with `hack rescore`, no new model calls). Every later Sonnet run passed 12/12 directly.
- The one precision miss for the Claude models is an extra LANG-PREC finding on the Arabic/English conflict contract, which is arguably correct.

Guarantees enforced in code, each covered by a test (60 tests): a critical finding never approves or negotiates; approval needs every page read, every clause typed, liability and governing-law clauses present, no unclear clause, no finding filed under a mismatched rule, and no instruction aimed at the AI reviewer in the text; deterministic red flags must agree (critical ones always escalate, others must be recorded or cleared with a verbatim quote); quotes must appear verbatim in the clause; outward sends need approval (or the queue's auto-send policy) and are route-gated; a run that ends without a route goes to a lawyer; an instruction aimed at the reviewer, found by the regex or reported by the model, forces escalation; an identical tool call is not repeated a third time.

Known limits: playbook rules are illustrative demo defaults (not legal advice); eval data is synthetic; the red-flag patterns were written against the main suite and caught only 1 of 13 issues on the blind held-out set, so they are a net for known wording, not a general detector; the local model is slow on this laptop (p95 ~20 minutes) and can loop (one case hit the turn cap); Arabic recall not measured separately (4 Arabic/bilingual cases).
