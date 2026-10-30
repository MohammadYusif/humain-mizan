# Results (reproduce with `uv run hack eval --model <id>`)

## Everything we tested, at a glance

59 different contracts, 27 of them real public contracts we did not write, plus 126 automated tests that make no API calls. Every answer key was written before Mizan saw the contract, by reviewers that never saw its output; the blind sets' keys were committed to git before their only run. Claude Sonnet 5.5, effort medium.

| Test set | Contracts | Routes right | Risky contracts approved | Finding recall / precision |
|---|---|---|---|---|
| Main suite, run 4 times (same result every run) | 12 × 4 | 48/48 | **0/36** | 100% / 94% |
| Blind sets written by another agent (2 batches) | 20 | 20/20 | **0/14** | 92-100% / 88-100% |
| Real: SEC filings, Saudi government contracts, terms of service | 15 | 14/14 | **0/14** | 73% / 97% |
| **Real, second batch, blind** (12 CUAD contracts, picked by a rule) | 12 | 11/12 | **0/12** | 66% / 96% |
| Names hidden from the model (data policy) | 12 | 12/12 | **0/9** | 100% / 94% |
| Another company's playbook, no code change | 8 | 8/8 | **0/5** | 100% / 100% |

Across every set, Mizan never approved a contract its answer key sends to negotiation or a lawyer. Where it is weakest is completeness on real contracts: it finds the liability, interest, indemnity and non-compete problems, and misses about a third of the termination, payment-term and confidentiality-term issues. Details for each set follow.

## Repeatability (`evals/proof/*-repeat-*.json`)

The main suite run three more times back to back, 2026-10-30, on top of the earlier run: 12/12, route accuracy 100%, 0/9 wrong approvals, recall 100%, precision 94% in all four runs. Latency p50 16.2-17.1s; $1.46 for the three runs.

## Second real batch, blind (`evals/real/cases-batch2.jsonl`)

12 more CUAD contracts (public SEC filings with clause annotations by The Atticus Project's lawyer-reviewed annotators), run after the liability-cap fix to test it on contracts it had never seen. Picked by a rule in `scripts/select_cuad_batch.py` (service-type contracts, 15-150 KB, ordered by the SHA-256 of the filename: 42 qualified, the first 12 taken), so nobody chose them. Labelled by agents that never ran Mizan, from the text and CUAD's annotations: 126 checks, 41 issues, 34 checks decided by CUAD after checking the span against the text. Labels committed (`7cc74f5`) before the first and only run, 2026-10-30.

| Claude Sonnet 5.5, one blind run | Result |
|---|---|
| **Approved a contract that should not be approved** | **0 / 12** |
| Route accuracy | 92% (11/12) |
| Finding precision | 96% (one extra finding) |
| Finding recall | 66% (27/41); on CUAD-decided issues 5/8 |
| Cost for 12 contracts / p50 latency | $2.20 / 38s |

By rule, found / labelled: liability cap 6/7, late-payment interest 5/5, indemnity 3/3, non-compete 2/2, IP ownership 2/3, auto-renewal 1/2, payment terms 4/7, termination for convenience 3/8, confidentiality term 1/4. The one route miss: Pareteum's hosting agreement, where the liability cap carves out our IP indemnity (so our liability there is uncapped); Mizan read the cap as covering us and routed to negotiate rather than escalate. Negotiate still means a person sends the redline: nothing was approved.

What the labels found about CUAD itself: on 5 of the 12 contracts CUAD's "cap on liability" annotation points at a clause that limits only the supplier, or only excludes consequential damages; read literally it would have marked uncapped contracts as capped. The labellers checked every CUAD span against the text and overruled it there.

We report this as measured and did not tune anything on it. What it cannot show: these are US filings under US law, which our Saudi playbook always flags, so none could be approved; approvals of real compliant contracts are still untested.

## Synthetic contracts (main suite)

12 contracts we wrote ourselves (7 English, 4 Arabic/bilingual incl. 1 Arabic/English conflict, 2 traps, 1 prompt-injection, 1 missing liability clause); labels written by a separate reviewer agent and checked against the routing code. Small sample: treat as a smoke test, not a benchmark. Effort `medium`, 2026-10-29. The curated result files are in `evals/proof/` (what the Proof screen shows).

## Current configuration (red-flag checks + completion check + liability-cap evidence)

| Metric | Claude Sonnet 5.5 | qwen3:14b, local (Ollama) |
|---|---|---|
| Cases passed (all checks) | 12/12 | 11/12 |
| Route accuracy | 100% | 92% |
| **Approved a contract that should not be approved** | **0 / 9** | **0 / 9** |
| Left unrouted (goes to a lawyer as "unrouted") | 0 | 1 (looped on findings until the 20-turn cap) |
| Finding recall / precision | 100% / 94% | 94% / 94% |
| Completion-check nudges used | 0 | 9 across 12 contracts |
| Latency p50 / p95 | 17.8s / 21.8s | 366s / 1186s |
| Cost per contract | ~$0.052 | local, no API cost |

The qwen3:14b column was measured before the liability-cap evidence check was added and not re-run (about an hour on this laptop); the check can only turn approvals into escalations.

## Held-out (blind) test: contracts the system was never tuned on

12 more contracts (`evals/heldout/`) written by a separate agent that never saw the red-flag patterns, the main contracts or their labels: seven industries (construction, fleet, medical supplies, marketing, freight, cloud hosting, facility management, catering, staffing, equipment lease, cybersecurity, translation), 6 English, 4 Arabic, 2 bilingual, with traps, unusually worded critical liability, an Arabic prompt-injection and a missing governing-law clause.

| Claude Sonnet 5.5 | Blind first run | Current (after the injection fix and the liability-cap check) |
|---|---|---|
| Route accuracy | 92% | **100%** |
| **Approved a contract that should not be approved** | **0 / 8** | **0 / 8** |
| Finding recall / precision | 100% / 100% | 92% / 100% |
| Latency p50 / cost per contract | 15.9s / $0.052 | 18.4s / $0.053 |

**The local model on the held-out set (qwen3:14b, blind):** 50% of cases passed, route accuracy 67%, **2 of 8 risky contracts approved** (`ho-medical-supplies`, and `ho-staff-catering`, which has a critical liability issue), 2 left unrouted (they go to a lawyer), recall 46%.

**What this shows about the red-flag patterns:** they catch **1 of 13** labelled held-out issues, against 12 of 12 on the main suite they were written against. Unusual wording ("not subject to any monetary ceiling", "a surcharge for each month of delay") slips past them. So on unseen contracts the safety comes from the model: Claude Sonnet 5.5 found every issue that mattered (100% route accuracy, 0 wrong approvals), the local model did not, and the patterns were not a reliable net under it. We report this as measured and have **not** widened the patterns to fit the held-out wording. Conclusion: run Mizan on a strong model for unattended use; the local ("sovereign") mode needs a lawyer on every contract.

The blind run's one miss was the Arabic prompt-injection: the model noticed the instruction, ignored it and flagged it in the memo, but the injection regex did not match its wording, so code routed the contract to negotiate instead of escalate (it was never approved). The fix lets the model report an injected instruction with a verified quote as a second detector; the regex was deliberately **not** widened to fit the held-out wording. After the fix the only miss is one unrecorded language-precedence finding on the bilingual audit contract, where the route was still correct.

## Second blind batch (`evals/heldout/cases-batch2.jsonl`)

8 more contracts in industries not used before (airport ground handling, hospital laundry, solar O&M, school transport, translation-memory SaaS, colocation, event security, pharmacy cold chain), written and labelled by a separate agent that saw neither the red-flag patterns nor any model output. Labels committed (`f1f75c6`) before the first and only run, 2026-10-30.

| Claude Sonnet 5.5 | Result |
|---|---|
| Cases passed / route accuracy | 8/8 / 100% |
| **Approved a contract that should not be approved** | **0 / 6** |
| Recall / precision | 100% / 88% |
| Latency p50 / cost per contract | 16.9s / $0.054 |

The one precision miss is an extra INDEMNITY finding on `hb-colocation` (escalated anyway for its uncapped liability).

## Another company's rules (`evals/policy/`)

The same 8 contracts reviewed under a different buyer's playbook, loaded with `HACK_PLAYBOOK=evals/policy/other-buyer.json` and no code change: payment no sooner than 60 days and prepayment at most 30%; a supplier exit on 30+ days' notice accepted for 12-month terms. Labels were written from the policy before the run. Result: 8/8, route accuracy 100%, 0/5 wrong approvals, recall 100%, $0.44 in total. Both expected route changes happened: `ar-services-01` approve → negotiate (45-day payment), `services-en-01` negotiate → approve (supplier exit now acceptable). First graded at 64% precision because the labels had no `scope` (findings under rules a case does not label counted as false); scope added and re-graded with `hack rescore`, no new model calls, named in the result file.

## Reviewed with names hidden (data policy)

The 12 main contracts reviewed as Internal (`HACK_SAMPLE_SENSITIVITY=internal`): party names, emails, phone numbers, IBANs and ID/CR/VAT numbers replaced by placeholders before the model saw them, and put back for people afterwards. 2026-10-30, one run.

| Claude Sonnet 5.5 | Names shown | Names hidden |
|---|---|---|
| Cases passed / route accuracy | 12/12 / 100% | 12/12 / 100% |
| **Approved a contract that should not be approved** | **0 / 9** | **0 / 9** |
| Recall / precision | 100% / 94% | 100% / 94% |

A scan of the run's traces finds no party name sent to the model. What is not replaced: product names that carry a supplier's brand ("Nimbus Fleet Analytics") and places ("incorporated in Hamburg"), which the governing-law check needs; Arabic party names are found only where the contract introduces them with a defined role («العميل»). Restricted contracts are never sent to an external model, so they have no quality number: a lawyer reviews them.

## Real contracts (`evals/real/`)

15 public contracts we did not write: 6 company contracts filed with the US SEC from CUAD (clause annotations by The Atticus Project's lawyer-reviewed annotators), Zoom and Dropbox terms of service from CLAUDETTE (clauses tagged unfair by its annotators), two Saudi-law SEC exhibits (Lucid's EV purchase agreement with the Ministry of Finance, Saudi Aramco's purchase-order terms), three Ministry of Finance model contracts (Etimad) and two EXPRO framework agreements of 79 and 101 pages, read by OCR. Labels were written by reviewers who never saw model output and committed before the first run (`57bea38`); each records who made it. Route labels and playbook judgements are ours. Run with a 40-turn cap and a $4 per-contract budget (long contracts), effort medium.

| Claude Sonnet 5.5 | First run (blind) | After the liability-cap check (same contracts) |
|---|---|---|
| Route accuracy (14 with a route label) | 57% | **100%** |
| **Approved a contract that should go to a lawyer** | **5 / 14** | **0 / 14** |
| Issues marked by outside annotators that it found | 7 / 7 | 7 / 7 |
| Recall / precision (all labels, in scope) | 75% / 94% | 73% / 97% |
| Cost for 15 contracts / p50 latency | $3.47 / 36s | $3.44 / 35s |

**What the first run found:** on buyer-side paper (the Ministry of Finance and EXPRO contracts, Aramco's purchase order) the agent typed clauses about the *supplier's* liability as the limitation-of-liability clause and judged "supplier's liability is uncapped, in our favour", so the presence check passed and nothing capped *our* liability. Five contracts were approved that our playbook sends to a lawyer. **The fix** (a general rule, not fitted to the wording): approval or negotiation now needs the words that cap our liability, quoted and verified by code, from a clause typed as limitation of liability; without them the contract escalates. The re-run is on the same contracts, so it is not blind. After the fix the main suite is still 12/12 and the held-out suite still routes 100% with 0/8 wrong approvals, so approvals of compliant contracts survived.

Still missed after the fix: the agent does not itself flag "our liability is uncapped" on the Lucid and Aramco contracts (the new check escalates them); 4 of 8 minor CONF-TERM labels (supplier-only confidentiality with no end date, which is arguably in our favour); 4 of 5 PAY-TERMS labels, mostly our literal reading that subscription billing in advance is a >50% prepayment; Corio's IP and payment terms. One extra TERM-CONV finding against a team label.

What this suite can and cannot show: recall against independent annotations (only 7 such labels: small), false alarms and safe routing on real Saudi buyer paper, and robustness to long real Arabic documents read by OCR (85-87% OCR confidence). It cannot show lawyer-validated routes, recall on risky Arabic contracts (no public labelled source exists; that stays measured on our synthetic suites), or benchmark-level numbers. No real contract here should be approved under our playbook, so approvals of real compliant contracts are not tested.

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

Guarantees enforced in code, each covered by a test (99 tests): a critical finding never approves or negotiates; approval needs every page read, every clause typed, liability and governing-law clauses present, the words that cap our own liability quoted and verified, no unclear clause, no finding filed under a mismatched rule, and no instruction aimed at the AI reviewer in the text; deterministic red flags must agree (critical ones always escalate, others must be recorded or cleared with a verbatim quote); quotes must appear verbatim in the clause; outward sends need approval (or the queue's auto-send policy) and are route-gated; a run that ends without a route goes to a lawyer; an instruction aimed at the reviewer, found by the regex or reported by the model, forces escalation; an identical tool call is not repeated a third time; text read from a scan is acted on automatically only when OCR was confident (otherwise it escalates with the OCR confidence as the reason).

Known limits: playbook rules are illustrative demo defaults (not legal advice); eval data is synthetic; the red-flag patterns were written against the main suite and caught only 1 of 13 issues on the blind held-out set, so they are a net for known wording, not a general detector; the local model is slow on this laptop (p95 ~20 minutes) and can loop (one case hit the turn cap); Arabic recall not measured separately (4 Arabic/bilingual cases); the OCR confidence gate is calibrated on three sample scans we made (clean Arabic 87% mean confidence, clean English 96%, blurry photo 64%), not on real-world scans, and handwriting, stamps and signatures are not read.
