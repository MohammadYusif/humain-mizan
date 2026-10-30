# Real-world suite

Fifteen public contracts we did not write, to test Mizan outside our own test contracts.

| Group | Contracts | Labels |
|---|---|---|
| CUAD (SEC filings) | 6 English service, hosting, outsourcing and support contracts | Where a clause is: CUAD's lawyer-reviewed annotators. Whether it breaks our playbook: us. |
| CLAUDETTE | Zoom and Dropbox terms of service | Clauses tagged unfair by CLAUDETTE annotators (limitation of liability, unilateral termination); the rest: us. |
| Saudi law, SEC filings | Lucid's EV purchase agreement with the Ministry of Finance; Saudi Aramco purchase order terms | Us. |
| Saudi government | Ministry of Finance model contracts (IT, services, supply) and EXPRO framework agreements (IT, cleaning), Arabic | Us. |

- `sources.json`: where each document comes from, its SHA-256, licence notes and who the customer is.
- `cases.jsonl`: the labels. `scope` lists the rules each case labels; findings under other rules are left out of precision. `by` on each check says who made it (`CUAD`, `CLAUDETTE` or `team`). Every label was written before Mizan was run on the contract, by reviewers who did not see its output.
- The texts are not in git (third-party, not ours to redistribute). Fetch and convert them with `scripts/fetch_real_contracts.py` (Arabic PDFs need OCR, so run that one in Docker; see the script's docstring).

Run: `HACK_MAX_TURNS=40 HACK_BUDGET_USD=4 uv run hack eval evals/real/cases.jsonl --suite real` (long contracts need more turns and budget than the defaults; the limits are saved with the results). The second batch: the same command with `evals/real/cases-batch2.jsonl`.

## Second real batch (`cases-batch2.jsonl`), blind

12 more CUAD contracts, added after the liability-cap fix so that the fix is tested on contracts it was never run on. The steps, in this order:

1. **Selection by rule, not by hand.** `scripts/select_cuad_batch.py` takes every CUAD contract whose type names a service the buyer receives (services, hosting, outsourcing, maintenance, support, consulting, processing, development), drops the six already used, keeps 15-150 KB of text, and orders them by the SHA-256 of the filename. 42 qualified; the first 12 were taken. The script is in git, so anyone can rerun the pick.
2. **Pinned sources.** Each text is pinned by SHA-256 in `sources.json` (group `cuad-2`).
3. **Labels first.** Separate labelling agents that never ran Mizan or saw any of its output read each contract with its CUAD annotations (The Atticus Project's lawyer-reviewed annotators) and wrote the answer key. `by: "CUAD"` marks checks that CUAD's annotation decides, after the labeller checked the span against the text; `team` marks the playbook judgements. The labels were committed before the first run.
4. **One run, graded by code.** One run with the same settings as the first suite, graded by `hack eval`; the result file is saved as it came out.

What it cannot show: these are US filings under US law, so governing law always fails our Saudi playbook and none of them can be approved. Approvals of real compliant contracts stay untested.

## What the suite can and cannot show

What it can show: recall against independent annotations (CUAD, CLAUDETTE), false alarms on real Saudi buyer paper, and robustness to long real documents (up to 100 pages of Arabic read by OCR). What it cannot: lawyer-validated routes (route labels are ours), recall on risky Arabic contracts (no public labelled source exists), or benchmark-level numbers at this size. Governing law is out of scope on non-Saudi contracts, where it would always be a finding.
