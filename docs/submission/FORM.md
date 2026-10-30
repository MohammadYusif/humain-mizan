# Submission form: copy and files

Files are in this folder. Paste the text as is; the rich-text fields take the lists as typed.

## Images

| Field | File |
|---|---|
| Background image | `background.png` (1920×1080) |
| Project logo | `logo-100.png` (100×100) or `logo-512.png` |
| How it works, step 1 / 2 / 3 | `step-1-upload.png`, `step-2-findings.png`, `step-3-route.png` (1200×1200, square) |
| Presentation | `mizan-deck.pdf` (10 slides) |
| The issue / Our solution, "Upload file" | optional; leave empty or attach `mizan-deck.pdf` |

## Project name

Mizan

## Project description

Mizan is an agent that owns contract review for an in-house legal team. It reads supplier contracts in Arabic, English or both, typed or scanned, checks every clause against the company's playbook, and routes each one: approve, negotiate (it writes the redline and the message to the supplier), or escalate to a lawyer with the exact question. The model reads and records findings with word-for-word quotes; code decides the route and will not approve anything it cannot verify. On 35 contracts it was not tuned on, including 15 real public contracts and Saudi government contracts in Arabic, the current version approves none that should go to a lawyer, at about 5 cents and 17 seconds for a typical contract.

## Project challenge(s)

Challenge 3: Autonomous Enterprise

## The issue

Legal teams read every supplier contract by hand, and most of them are routine. Lawyers spend their time confirming that routine contracts are routine, while the risky ones look the same at a glance: an uncapped liability, a monthly late charge, personal data sent abroad. In Saudi Arabia these contracts arrive in Arabic, English or both, and often as scans.

Automating review is easy. The hard part is automating it without the one mistake that costs the most: a confident approval of a contract a lawyer should have seen. Most tools leave that decision to the model.

## Our solution

Mizan reviews the contract end to end and ends every review in one of three routes:

- **Approve**: the contract meets the playbook and the evidence is on record (every clause read, the words capping our liability quoted). No one has to touch it.
- **Negotiate**: Mizan writes the redline and a clean message to the supplier, citing the contract's own article numbers.
- **Escalate**: critical risk, a missing clause, an instruction hidden in the contract, or a scan it could not read with confidence. A lawyer gets it with the exact question.

The model reads, types each clause and records findings with verbatim quotes. Code computes the route, and approval needs evidence, not only the absence of findings. A second detector, Arabic and English red-flag patterns that run without the model, must agree. Only escalations reach the lawyers' inbox, and their decisions become proposed playbook changes that a person accepts.

Measured on contracts it was not tuned on: 12/12 routes on a blind held-out set, 8/8 on a second blind batch run once, and 14/14 on real public contracts (SEC filings, Zoom and Dropbox terms, Saudi Ministry of Finance and EXPRO contracts up to 101 pages), with 0 risky contracts approved. The first run on the real contracts approved 5 it should not have; that led to the liability-cap check, and every suite was re-run after it. Another company's rules load from a file with no code change.

## How it works

**Step 1: Bring any contract**
Upload a PDF, Word file, text, scan or phone photo, in Arabic, English or both. Scans are read by OCR inside the container and the confidence is kept: a doubtful reading goes to a lawyer.

**Step 2: Every clause checked**
The agent types every clause and checks it against the playbook. Each finding quotes the contract word for word and proposes the playbook's wording as a redline. Pattern checks run alongside, without the model.

**Step 3: Code decides the route**
Severity and route are computed by code. A critical finding never approves. Negotiations go out with a redline; escalations reach a lawyer with the question to answer.

## Why should HUMAIN hire you? What makes you and your project stand out?

Edit the bracketed line; the rest is what the project shows.

> [One or two sentences about you: your study or work, and what you want to build at HUMAIN.]
>
> I measure before I claim. Every label in Mizan was written before the model saw the contract, and when the first run on real Saudi contracts approved 5 of 14 it should not have, I published that number next to the fix. The fix was a general rule, not a patch to the test wording: approval now needs the words that cap our liability, quoted and verified by code. The result went to 0 of 14, and I re-ran the earlier suites to make sure nothing else broke. I also reported what did not work: our pattern checks catch almost nothing on contracts they were not written for, so the system says plainly that local models need a lawyer on every contract.
>
> What makes Mizan stand out is where it puts the decision. The model reads; code decides; anything uncertain goes to a lawyer. It handles Arabic contracts and scans, which most contract tools do not, it runs privately with its own sign-in and local OCR, and every number in the submission can be reproduced from the repository, with continuous integration checking it on a fresh clone. That is how I would want to build agents at HUMAIN: useful on day one, and honest about where they stop.

## Demo video

Record with Loom following `docs/DEMO.md` (about 4 minutes; the guided demo replays recorded runs, so it works without network). Before recording: light theme, no `.env`, no brief or `data/` folder on screen.

## Project code

The repository is private (hackathon terms). Give the judges access in the way the platform asks: add their GitHub accounts as collaborators on `MohammadYusif/humain-mizan`, or upload a zip of the repository without `.env` and `data/`.
