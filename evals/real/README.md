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

Run: `HACK_MAX_TURNS=40 HACK_BUDGET_USD=4 uv run hack eval evals/real/cases.jsonl --suite real` (long contracts need more turns and budget than the defaults; the limits are saved with the results).

What it can show: recall against independent annotations (CUAD, CLAUDETTE), false alarms on real Saudi buyer paper, and robustness to long real documents (up to 100 pages of Arabic read by OCR). What it cannot: lawyer-validated routes (route labels are ours), recall on risky Arabic contracts (no public labelled source exists), or benchmark-level numbers at this size. Governing law is out of scope on non-Saudi contracts, where it would always be a finding.
