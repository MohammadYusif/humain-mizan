# Results (synthetic contracts; reproduce with `uv run hack eval --model <id>`)

12 contracts we wrote ourselves (7 English, 4 Arabic/bilingual incl. 1 Arabic/English conflict, 2 traps, 1 prompt-injection, 1 missing liability clause); labels written by a separate reviewer agent and checked against the routing code. Small sample: treat as a smoke test, not a benchmark. Effort `medium`, 2026-10-29. All runs below include the deterministic red-flag tripwires unless noted.

| Metric | Claude Sonnet 5.5 | Claude Opus 5.5 ¹ | qwen3:14b local, no tripwires | qwen3:14b local, with tripwires |
|---|---|---|---|---|
| Cases passed (all checks) | 12/12 | 11/11 + 1/1 | 5/12 | 5/12 |
| Route accuracy | 100% | 100% | 58% | 75% |
| **Approved a contract that should not be approved** | **0 / 9** | **0 / 9** | **3 / 9** (incl. a critical liability issue) | **0 / 9** |
| Left unrouted (stopped before scoring) | 0 | 0 | 1 | 2 |
| Finding recall / precision | 100% / 94% | 100% / 94% | 56% / 90% | 81% / 87% |
| Latency p50 / p95 | 16.2s / 22.1s | 26.8s / 38.4s | 312s / 567s | 139s / 311s |
| Cost per contract | ~$0.047 | ~$0.10 | local, no API cost | local, no API cost |

¹ Opus 5.5 was measured before the tripwires were added (11-case run plus the missing-clause case run separately).

How the red flags behaved with Sonnet: 3 critical flags (all on contracts that must escalate), 15 major flags, all 15 recorded by the model as findings; 0 cleared, 0 unresolved. The model and the deterministic checks agreed on every contract.

How they behaved with the local model: the same pipeline that let qwen3 approve 3 risky contracts now escalates them, because a critical red flag cannot be cleared and a major one cannot be silently ignored. The remaining failures are safe-direction: one clean NDA escalated (a false liability finding) and two contracts where the model stopped before scoring (no route, so nothing was approved or sent), plus three runs where it scored correctly but did not take the follow-up action. With these numbers on-premise mode is safe from wrong approvals but would put more work on lawyers.

Sonnet's first pass was graded 11/12 because on the bilingual licence it recorded the IP issue on the English half (c6) of the clause whose Arabic half (c5) was labelled; the label now accepts either half and that run was re-graded with `hack rescore` (no new model calls). The one precision miss for both Claude models is an extra LANG-PREC finding on the Arabic/English conflict contract, which is arguably correct.

Guarantees enforced in code, each covered by a test (44 tests): a critical finding never approves or negotiates; approval needs every page read, every clause typed, liability and governing-law clauses present, no unclear clause, no finding filed under a mismatched rule, and no instruction aimed at the AI reviewer in the text; deterministic red flags (Arabic + English) must agree: critical ones always escalate, others must be recorded or cleared with a verbatim quote; quotes must appear verbatim in the clause; outward sends to the counterparty need approval (or the queue's auto-send policy) and are route-gated.

Known limits: playbook rules are illustrative demo defaults (not legal advice); eval data is synthetic and the red-flag patterns were tuned on these same contracts, so their recall on unseen contracts will be lower; Arabic recall gap not measured separately (4 Arabic/bilingual cases, all passed by both Claude models).
