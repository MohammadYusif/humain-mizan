// Mizan pitch deck. Build: uv run python docs/submission/build.py
#let ink = oklch(23.5%, 0.018, 62deg)
#let muted = oklch(45%, 0.022, 64deg)
#let line-c = oklch(87.2%, 0.02, 80deg)
#let paper = oklch(96.8%, 0.013, 84deg)
#let card = oklch(98.6%, 0.008, 84deg)
#let primary = oklch(37%, 0.062, 166deg)
#let brass = oklch(68%, 0.1, 80deg)
#let approve = oklch(44%, 0.1, 152deg)
#let negotiate = oklch(49%, 0.105, 64deg)
#let escalate = oklch(49%, 0.145, 33deg)

#set document(title: "Mizan", author: "Mohammad Yusif")
#set page(width: 33.867cm, height: 19.05cm, margin: (x: 2.2cm, top: 1.9cm, bottom: 1.6cm), fill: paper,
  footer: context {
    set text(size: 9pt, fill: muted)
    grid(columns: (1fr, auto), [Mizan · HUMAIN Future AI Builders Hackathon · Challenge 3], counter(page).display())
  })
#set text(font: "IBM Plex Sans Arabic", size: 21pt, fill: ink)
#set par(leading: 0.62em)

#let mono(s) = text(font: "IBM Plex Mono", size: 0.85em, s)
#let kicker(s) = block(below: 0.45em, text(size: 15pt, fill: primary, weight: "medium", s))
#let title(s) = block(below: 0.9em, text(size: 36pt, weight: "semibold", s))
#let box-card(body, inset: 16pt) = block(fill: card, stroke: 0.6pt + line-c, radius: 6pt, inset: inset, width: 100%, body)
#let route(name, color, body) = box-card[
  #text(size: 28pt, weight: "semibold", fill: color, name) \
  #v(0.2em) #text(size: 18pt, fill: muted, body)
]
#let big(n, label, color: ink) = [
  #text(size: 50pt, weight: "semibold", fill: color, n) \
  #text(size: 16pt, fill: muted, label)
]

// 1. Title
#v(1fr)
#grid(columns: (auto, 1fr), column-gutter: 28pt, align: horizon,
  image("../../src/hack/assets/logo.svg", width: 4.2cm),
  [
    #text(size: 60pt, weight: "semibold")[Mizan] #h(12pt) #text(size: 50pt, fill: primary)[ميزان] \
    #text(size: 24pt, fill: muted)[An agent that owns contract review, and knows when not to decide]
  ])
#v(1fr)
#text(size: 21pt, fill: muted)[
  Reads Arabic, English and bilingual contracts, typed or scanned. Checks every clause against the
  buyer's playbook. Approves, negotiates with a redline, or escalates to a lawyer with the exact question.
]
#v(0.6cm)
#text(size: 16pt, fill: muted)[Mohammad Yusif · Claude Sonnet 5.5 · 30–31 October 2026]

#pagebreak()
// 2. The issue
#kicker[The issue]
#title[Legal reads every contract by hand, and most of them are routine]
#grid(columns: (1fr, 1fr), column-gutter: 1.2cm,
  [
    - Supplier contracts arrive in Arabic, English or both, often as scans.
    - Lawyers spend their time confirming that routine contracts are routine.
    - The risky ones look like the routine ones: an uncapped liability, a monthly late charge, data sent abroad.
  ],
  box-card(inset: 22pt)[
    #text(weight: "semibold")[The expensive mistake is a confident approval.] \
    #v(0.3em)
    #text(fill: muted)[Automating review is easy. Automating it so that nothing risky is signed without a lawyer
    is the problem we set out to solve, and the number we measure first.]
  ])

#pagebreak()
// 3. Solution
#kicker[Our solution]
#title[Every contract ends in one of three routes, decided by code]
#grid(columns: (1fr, 1fr, 1fr), column-gutter: 0.6cm,
  route("Approve", approve)[Meets the playbook, and the evidence for that is on record: every clause read, the cap on our liability quoted. No one touches it.],
  route("Negotiate", negotiate)[Major deviations. Mizan writes the redline and the message to the counterparty, citing the contract's own article numbers.],
  route("Escalate", escalate)[Critical risk, a missing clause, an injected instruction, a doubtful scan. A lawyer gets it with the exact question.],
)
#v(0.7cm)
#text(fill: muted)[The model reads, types clauses and records findings with verbatim quotes. It never chooses the route.]

#pagebreak()
// 4. How it works
#kicker[How it works]
#title[Upload, check every clause, route]
#grid(columns: (1fr, 1fr, 1fr), column-gutter: 0.6cm,
  ..(("1", "Bring any contract", "PDF, Word, text, scan or photo. Scans are read by local OCR; the confidence is kept.", "step-1-upload.png"),
     ("2", "Every clause checked", "Findings quote the contract word for word, with the playbook's wording as a redline.", "step-2-findings.png"),
     ("3", "Code routes it", "Severity and route come from code. A critical finding never approves.", "step-3-route.png"),
  ).map(((n, t, d, img)) => [
    #align(center, image(img, height: 7.2cm))
    #v(0.2em)
    #text(weight: "semibold")[#text(fill: primary)[#n] #h(4pt) #t] \
    #text(size: 16pt, fill: muted, d)
  ]))

#pagebreak()
// 5. Trust
#kicker[Why the route can be trusted]
#title[Approval needs evidence, not just no findings]
#grid(columns: (1fr, 1fr), column-gutter: 1.2cm, row-gutter: 0.5cm,
  [*Code owns the decision.* \ #text(fill: muted)[A critical finding never approves or negotiates, whatever the model writes.]],
  [*Two detectors.* \ #text(fill: muted)[Arabic and English red-flag patterns run without the model. Critical flags always escalate; others must be recorded or cleared with a quote.]],
  [*Evidence of coverage.* \ #text(fill: muted)[Every page read, every clause typed, liability and governing law present, the words capping our liability quoted and verified.]],
  [*Doubt goes to a lawyer.* \ #text(fill: muted)[Low OCR confidence, an unclear clause, an instruction aimed at the reviewer, or a run that never finished.]],
)

#pagebreak()
// 6. Results
#kicker[Task performance on unseen cases]
#title[No risky contract approved, on any suite]
#let th(s) = text(size: 15pt, fill: muted, s)
#table(columns: (2.2fr, 3.4fr, 1fr, 1.2fr, 1fr), stroke: none, inset: (x: 8pt, y: 9pt),
  table.hline(stroke: 0.6pt + line-c),
  th[Suite], th[What it is], th[Routes right], th[Wrongly approved], th[Per contract],
  table.hline(stroke: 0.6pt + line-c),
  [Main], text(size: 17pt)[12 contracts we wrote and tuned on], [12/12], [*0/9*], [\$0.052],
  [Held-out, blind], text(size: 17pt)[12 by a separate agent that never saw our patterns], [12/12], [*0/8*], [\$0.053],
  [Second blind batch], text(size: 17pt)[8 new industries, labels committed before the only run], [8/8], [*0/6*], [\$0.054],
  [Real contracts], text(size: 17pt)[15 public: SEC filings, Zoom and Dropbox terms, Saudi government contracts in Arabic up to 101 pages], [14/14], [*0/14*], [\$0.23],
  table.hline(stroke: 0.6pt + line-c),
)
#text(size: 16pt, fill: muted)[Claude Sonnet 5.5, effort medium. All 7 issues marked by outside annotators (CUAD, CLAUDETTE) found. p50 about 17 s per contract.]

#pagebreak()
// 7. Iteration
#kicker[Evaluation and iteration]
#title[Real contracts, first run: 5 wrongly approved]
#grid(columns: (1fr, 1.3fr), column-gutter: 1.2cm,
  [
    #grid(columns: (1fr, 1fr), row-gutter: 0.6cm, column-gutter: 0.6cm,
      big("5/14", "wrongly approved, blind first run", color: escalate),
      big("0/14", "after one general fix", color: approve),
      big("57%", "routes right, first run"),
      big("100%", "after, with main and held-out re-checked"),
    )
  ],
  [
    On Saudi buyer-side contracts the agent read the *supplier's* uncapped liability as the liability clause,
    so nothing capped *ours*, and code approved.

    #v(0.3em)
    *The fix is a rule, not a patch to the wording:* approval now needs the words that cap our liability,
    quoted and verified by code. Without them the contract escalates.

    #v(0.3em)
    #text(fill: muted, size: 16pt)[Labels came first on every suite. Our red-flag patterns catch 12/12 on the
    suite they were written for and 1/13 blind; we reported that rather than tune them to the test.]
  ])

#pagebreak()
// 8. Robustness
#kicker[Robustness and adaptation]
#title[Another company's rules, Arabic scans, weaker models]
#grid(columns: (1fr, 1fr, 1fr), column-gutter: 0.6cm,
  box-card[*A new playbook from a file* \ #v(0.2em) #text(size: 17pt, fill: muted)[A different buyer's payment and termination rules, no code change: 8/8, both expected route changes, 0/5 wrong approvals.]],
  box-card[*Scans and photos* \ #v(0.2em) #text(size: 17pt, fill: muted)[A clean Arabic scan (87% OCR confidence) routes like the typed original. A blurry photo (64%) goes to a lawyer.]],
  box-card[*A local model* \ #v(0.2em) #text(size: 17pt, fill: muted)[qwen3:14b went from 3/9 wrong approvals to 0/9 with the safeguards. Blind, it still approved 2/8, so local mode needs a lawyer on every contract. We say so.]],
)
#v(0.6cm)
#text(fill: muted)[Lawyers' decisions become proposed playbook amendments a human accepts; critical rules never relax.]

#pagebreak()
// 9. Engineering
#kicker[Engineering]
#title[Built to be checked]
#grid(columns: (1fr, 1fr), column-gutter: 1.2cm,
  [
    - FastAPI + a tool loop with a turn cap, USD budget and a JSONL trace per run
    - React, Tailwind and shadcn/ui; one Docker image with the API, UI and Arabic OCR
    - Redline and memo PDFs typeset from data, never markup, so contract text cannot inject
    - Private by default: Mizan's own sign-in; secrets only in the environment
  ],
  [
    - 82 tests with no API calls; every routing guarantee has one
    - CI on a fresh clone: lint, tests, licence check, UI build, Docker smoke test with sign-in
    - #mono("hack eval --model A --model B") compares models; #mono("hack rescore") re-grades saved traces for free
    - Every number on these slides is in the repo and on the Proof screen
  ])

#pagebreak()
// 10. Limits
#kicker[What it does not do yet]
#title[Stated, not hidden]
- Playbook rules are illustrative, not legal advice; most labels are ours (7 real-contract labels come from outside annotators).
- The real Saudi contracts are all buyer paper, so approving a real compliant contract is untested.
- Risky Arabic contracts are measured only on our synthetic suites: no public labelled source exists.
- The OCR gate is calibrated on three sample scans; handwriting, stamps and signatures are not read.
- Suites are 8 to 15 contracts: strong signals, not a benchmark.
#v(1fr)
#text(size: 20pt, weight: "semibold")[The model reads. Code decides. Anything uncertain goes to a lawyer.]
