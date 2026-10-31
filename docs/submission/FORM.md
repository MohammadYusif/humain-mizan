# Submission form: copy and files

Files are in this folder. Paste the text as is; the rich-text fields take the lists as typed. Every
number here matches docs/RESULTS.md, the deck and the Proof screen.

## Images

| Field | File |
|---|---|
| Background image | `background.png` (1920×1080; from `cover.html`, render with `render-cover.mjs`) |
| Project logo | `logo-100.png` (100×100) or `logo-512.png` |
| How it works, steps 1 to 5 | `step-1-upload.png`, `step-2-label.png`, `step-2-findings.png`, `step-3-route.png`, `step-5-signoff.png` (1200×1200, square) |
| Presentation | `mizan-deck.pdf` (10 slides) |
| The issue / Our solution, "Upload file" | optional; leave empty or attach `mizan-deck.pdf` |

## Project name

Mizan

## Project description (100 characters max)

Mizan reviews Arabic and English contracts and routes each one: approve, negotiate or escalate.

## Project challenge(s)

Challenge 3: Autonomous Enterprise

## The issue

Legal teams read every supplier contract by hand, and most of them are routine. Lawyers spend their time confirming that routine contracts are routine, while the risky ones look the same at a glance: an uncapped liability, a monthly late charge, personal data sent abroad. In Saudi Arabia these contracts arrive in Arabic, English or both, and often as scans.

Automating review is easy. The hard part is automating it without the one mistake that costs the most: a confident approval of a contract a lawyer should have seen. Most tools leave that decision to the model. I have seen this first-hand: when my SDAIA Academy capstone grader moved to a cheaper model, it cited quotes that did not exist in the student's files in 22 of 61 submissions.

## Our solution

Mizan reviews the contract end to end and ends every review in one of three routes:

- **Approve**: the contract meets the playbook and the evidence is on record (every clause read, the words capping our liability quoted). No one has to touch it.
- **Negotiate**: Mizan writes the redline and a message to the supplier, one numbered change per article, built by code from the redlines.
- **Escalate**: critical risk, a missing clause, an instruction hidden in the contract, or a scan it could not read with confidence. A lawyer gets it with the exact question.

The AI (Claude Sonnet 5.5) does the reading and the judgement: it types every clause against the playbook, decides how serious each deviation is, quotes the evidence word for word, finds the words that cap our liability, drafts the redline and notices instructions hidden in the contract. On contracts they were not written for, fixed patterns caught 1 of 13 issues; Claude found 12 of 13.

Code checks every quote against the contract and computes the route, so approval needs evidence, not only the absence of findings. A second detector, Arabic and English red-flag patterns that run without the model, must agree.

Before any model sees a contract, Mizan reads it on the server and suggests who may see it: Public, Internal (names and account numbers hidden from an external model) or Restricted (never sent to an external model). Raising a label is one click; lowering it takes a signed-in person and an answer, from fixed choices, for each thing Mizan found. One review runs at a time per contract, the next reader opens the finished review instead of running it again, and Restricted contracts and their reviews open only for Legal.

Tested on 59 contracts, 27 of them real contracts we did not write, with every answer key written before the run: Mizan approved none that should have gone to negotiation or a lawyer.

## How it works

Five steps (the form allows more than three). Step title 45 characters max, description 200.

**Step 1: Bring any contract** (image `step-1-upload.png`)
PDF, Word, text, scan or phone photo, in Arabic, English or both. Scans are read by OCR on the server, and a doubtful reading always goes to a lawyer.

**Step 2: Mizan labels it before any model sees it** (image `step-2-label.png`)
It reads the contract on the server and suggests Public, Internal or Restricted, showing what it found. Restricted contracts never reach an external model.

**Step 3: Every clause checked against the playbook** (image `step-2-findings.png`)
Each finding quotes the contract word for word and proposes the playbook's wording as a redline. Red-flag checks run alongside, without the model.

**Step 4: Code decides the route** (image `step-3-route.png`)
Approve, negotiate or escalate is computed by code from the findings. A critical finding never approves; an instruction hidden in the contract is escalated.

**Step 5: People stay in charge** (image `step-5-signoff.png`)
Lowering a label needs a signed-in person and a fixed answer per finding. One review at a time per contract; Restricted contracts open only for Legal.

## How we tested it (custom field, 5000 characters max)

Every number below comes from a run anyone can repeat from the repository, and every result is on the app's Proof screen.

How we test
1. The answer key is written first, before Mizan sees the contract, by reviewers that never saw its output.
2. The key is committed to git before the run, so it cannot drift towards the result.
3. The run is graded by code: the route, every finding, and above all whether a risky contract was approved.
4. Every result is kept, failures included. Nothing is re-run until it passes.

What we tested (Claude Sonnet 5.5, effort medium)
- Main suite, 12 contracts in Arabic, English and both, run 4 times: 48/48 routes right, 0 of 36 risky contracts approved, the same result every run.
- Blind sets written by another agent that never saw Mizan's rules or output, 20 contracts: 20/20 routes, 0 of 14 approved.
- Real contracts we did not write, 15: company contracts filed with the US Securities and Exchange Commission (most from CUAD, with lawyer-reviewed annotations; two are Saudi-law contracts of Saudi Aramco and Lucid), the Zoom and Dropbox terms of service, and five Saudi government contracts in Arabic (Ministry of Finance Etimad templates and EXPRO), up to 101 pages read by OCR: 14/14 routes, 0 of 14 approved.
- A second real batch, 12 more US SEC contracts picked by a fixed rule (ordered by a hash of the file name, so nobody chose them), labelled and committed before the only run: 11/12 routes, 0 of 12 approved.
- The main suite with names, contacts and account numbers hidden from the model: 12/12 routes, 0 of 9 approved, so the privacy layer costs nothing in safety.
- Another company's playbook loaded from a file, no code change: 8/8 routes, including both contracts that should change route under the new rules.
- 126 automated tests that make no API calls check every guarantee in code: routing, quotes, sign-off, roles, locks and the data policy.

What failed, and what we did
- The first run on the real contracts approved 5 of 14 that a lawyer should have seen. On buyer-friendly paper the model read the supplier's liability clause as ours and accepted that nothing capped our own. We did not patch the wording: we added one general rule. Approval now needs the words that cap our own liability, quoted and verified by code; without them the contract escalates. Result: 0 of 14. Every earlier suite was re-run and held. The 12 new real contracts were run after the fix, once, blind: 0 of 12 approved.
- The one route miss in the second batch: a hosting agreement whose liability cap carves out our own indemnity, so our liability there is uncapped. Mizan routed it to negotiate instead of escalate. Negotiate still means a person sends the redline: nothing was approved.
- Completeness on real contracts is the weak spot. Mizan finds about two thirds of the labelled issues: almost all liability, late-interest, indemnity and non-compete problems, and fewer termination, payment-term and confidentiality-term ones. Precision stays at 96-97%.
- Our red-flag patterns catch known wording but only 1 of 13 issues on the blind set, so the model is the real detector and we say so in the app. A local model approved 2 of 8 risky contracts, so local mode always needs a lawyer.

What the tests cannot show yet
No real contract in our sets should be approved, so approving a real compliant contract is untested. No public source labels risky Arabic contracts, so Arabic recall is measured on our own contracts. The playbook rules are illustrative, not legal advice. Next: lawyer-validated labels, including risky Arabic contracts, and real compliant ones.

## Why should HUMAIN hire you? What makes you and your project stand out?

> I am Mohammad Albeladi, DGExams AI builder and AI trainer at SDAIA Academy and KAUST. I teach people to build with these models and see every week where the gap is: demos that work on stage and systems that can be trusted with a decision. Mizan is my attempt at the second kind, and HUMAIN is where I want to build more of them.
>
> It is not my first system built this way. At SDAIA Academy I wrote the engine that grades every capstone I set (https://84-8-103-122.sslip.io): it reads each submission's syntax tree instead of searching for keywords, keeps the rubric as data, and holds anything borderline for me. 421 trainees across 20 cohorts have passed capstones graded this way. It also taught me the rule Mizan is built on. When I moved its AI pass from Claude to DeepSeek to cut cost, 22 of the 61 submissions DeepSeek graded (36%) cited quotes that were not in the student's files. None became a wrong grade, because the model only proposes: code checks every citation against the files and holds anything unconfirmed for a human. Mizan checks every quote against the contract for the same reason. I also built DGExams (dgexams.com), a preparation platform for the Saudi Medical Licensing Exam that re-answers every question independently and flags each place where the source and the model disagree.
>
> I measure before I claim. Every answer key in Mizan was written before the model saw the contract, and when the first run on real contracts approved 5 of 14 it should not have, I published that number next to the fix: approval now needs the words that cap our liability, quoted and verified by code. The result went to 0 of 14, the earlier suites were re-run, and 12 new real contracts, picked by a fixed rule and run once, came out at 0 of 12 approved. I also report what does not work: it misses about a third of the issues on real contracts.
>
> Before building, I looked at what exists. Spellbook and LegalOn work inside Word and suggest playbook redlines for a lawyer to accept. Luminance and Harvey read Arabic and are used by firms in the region, and Saudi startups such as Clauze.AI and Wathiq review Arabic and English contracts. So reading Arabic is not what sets Mizan apart. These tools help a lawyer review; Mizan is built to take routine contracts off the lawyer's desk, which means it has to prove when an approval is safe. Code decides the route from quoted evidence, every contract is labelled before any model sees it, and the results are measured on contracts it never saw, failures included. I could not find a vendor that publishes its accuracy that way.
>
> That is how I would want to build agents at HUMAIN: useful on day one, measured in the open, and honest about where they stop.

## Demo video

Record with Loom following `docs/DEMO.md` (about 3 minutes; the guided demo replays recorded runs, so it works without network). Before recording: light theme, no `.env`, no brief or `data/` folder on screen.

## Live demo and code

The live demo link goes in the platform's own field. Give the judges the user name `judge` and its password privately (not in a public field). The site is private: without signing in, nothing but the sign-in page is visible.

The repository is public, with the organisers' approval: https://github.com/MohammadYusif/humain-mizan
