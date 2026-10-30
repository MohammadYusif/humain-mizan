# Submission form: copy and files

Files are in this folder. Paste the text as is; the rich-text fields take the lists as typed. Every
number here matches docs/RESULTS.md, the deck and the Proof screen.

## Images

| Field | File |
|---|---|
| Background image | `background.png` (1920×1080; from `cover.html`, render with `render-cover.mjs`) |
| Project logo | `logo-100.png` (100×100) or `logo-512.png` |
| How it works, step 1 / 2 / 3 | `step-1-upload.png`, `step-2-findings.png`, `step-3-route.png` (1200×1200, square) |
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

Automating review is easy. The hard part is automating it without the one mistake that costs the most: a confident approval of a contract a lawyer should have seen. Most tools leave that decision to the model.

## Our solution

Mizan reviews the contract end to end and ends every review in one of three routes:

- **Approve**: the contract meets the playbook and the evidence is on record (every clause read, the words capping our liability quoted). No one has to touch it.
- **Negotiate**: Mizan writes the redline and a message to the supplier, one numbered change per article, built by code from the redlines.
- **Escalate**: critical risk, a missing clause, an instruction hidden in the contract, or a scan it could not read with confidence. A lawyer gets it with the exact question.

The model reads, types each clause and records findings with verbatim quotes. Code computes the route, and approval needs evidence, not only the absence of findings. A second detector, Arabic and English red-flag patterns that run without the model, must agree.

Before any model sees a contract, Mizan reads it on the server and suggests who may see it: Public, Internal (names and account numbers hidden from an external model) or Restricted (never sent to an external model). Raising a label is one click; lowering it takes a signed-in person and an answer, from fixed choices, for each thing Mizan found. Each person signs in with their own account: one review runs at a time per contract, a second person opens the first one's result instead of reviewing again, and Restricted contracts and their reviews open only for Legal.

How we tested it: every answer key was written before Mizan saw the contract, committed to git before the run, graded by code, and every result is kept, failures included.

- Main suite, run 4 times: 48/48 routes, 0/36 risky contracts approved, the same result every run.
- Blind sets written by another agent: 20/20 routes, 0/14 approved.
- Real contracts (SEC filings, terms of service, Saudi government contracts in Arabic up to 101 pages): 14/14 routes, 0/14 approved.
- A second real batch of 12, picked by a fixed rule and run once, blind: 11/12 routes, 0/12 approved.
- Another company's playbook from a file, no code change: 8/8 routes.

The first run on real contracts approved 5 it should not have. That led to one general rule, approval needs the words that cap our own liability, quoted and verified by code; every suite was re-run after it. Where it is weakest: on real contracts it finds about two thirds of the labelled issues (liability, interest, indemnity and non-compete almost all; termination and payment terms less often).

## How it works

**Step 1: Bring any contract**
Upload a PDF, Word file, text, scan or phone photo, in Arabic, English or both. Mizan reads it on the server first and suggests its label with what it found. Scans are read by OCR inside the container and the confidence is kept: a doubtful reading goes to a lawyer.

**Step 2: Every clause checked**
The agent types every clause and checks it against the playbook. Each finding quotes the contract word for word and proposes the playbook's wording as a redline. Pattern checks run alongside, without the model, and any instruction hidden in the contract is quoted and escalated, never followed.

**Step 3: Code decides the route**
Severity and route are computed by code. A critical finding never approves. Negotiations go out with a numbered redline message; escalations reach a lawyer's inbox with the question to answer.

## Why should HUMAIN hire you? What makes you and your project stand out?

> I am Mohammad Albeladi, an AI trainer at SDAIA Academy and KAUST. I teach people to build with these models and see every week where the gap is: demos that work on stage and systems that can be trusted with a decision. Mizan is my attempt at the second kind, and HUMAIN is where I want to build more of them.
>
> I measure before I claim. Every answer key in Mizan was written before the model saw the contract, and when the first run on real contracts approved 5 of 14 it should not have, I published that number next to the fix. The fix was a general rule, not a patch to the test wording: approval now needs the words that cap our liability, quoted and verified by code. The result went to 0 of 14, the earlier suites were re-run, and then 12 new real contracts it had never seen, picked by a fixed rule and run once, came out at 0 of 12 approved. I also report what does not work: it misses about a third of the issues on real contracts, and our pattern checks catch almost nothing on contracts they were not written for.
>
> What makes Mizan stand out is where it puts the decision. The model reads; code decides; anything uncertain goes to a lawyer. It handles Arabic contracts and scans, which most contract tools do not. It decides who may see each contract before any model does, runs privately with its own sign-in, roles and local OCR, and every number in the submission can be reproduced from the repository, with continuous integration checking it on a fresh clone. That is how I would want to build agents at HUMAIN: useful on day one, and honest about where they stop.

## Demo video

Record with Loom following `docs/DEMO.md` (about 3 minutes; the guided demo replays recorded runs, so it works without network). Before recording: light theme, no `.env`, no brief or `data/` folder on screen.

## Live demo and code

The live demo link goes in the platform's own field. Give the judges the user name `judge` and its password privately (not in a public field). The site is private: without signing in, nothing but the sign-in page is visible.

The repository is private (hackathon terms). Give the judges access in the way the platform asks: add their GitHub accounts as collaborators on `MohammadYusif/humain-mizan`, or upload a zip of the repository without `.env` and `data/`.
