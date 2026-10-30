# Lobby chat update (ready to paste)

Mizan update: tested on 59 contracts, 27 of them real public contracts we did not write.

How we test: we pick the contracts by a rule, write the answer key first, commit it to git, then run once and let code grade it. The blind sets are reported as they came out.

- Main suite, run 4 times: 48/48 routes right, 0 risky contracts approved, the same result every run
- Two blind sets written by another agent (20 contracts): 20/20, 0 of 14 risky approved
- 15 real contracts (SEC filings, Saudi government contracts in Arabic up to 101 pages, terms of service): 14/14, 0 of 14 risky approved
- New today: 12 more real SEC contracts, picked by a rule, labelled from lawyer-reviewed CUAD annotations, run once blind: 11/12 routes, 0 of 12 risky approved, 96% precision
- Same contracts with names hidden from the model: no change in results
- Another company's playbook, loaded from a file with no code change: 8/8

Where it is weak: on real contracts it finds about two thirds of the issues (66-73% recall). It reliably catches liability, interest, indemnity and non-compete problems and misses many termination and payment-term ones. So it is a safe router that never approves what it should not, but its issue list is not complete. We report that rather than tune it away.

Also 118 automated tests with no API calls, and every run's traces are saved so the grading can be repeated without the model.
