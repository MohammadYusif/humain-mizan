// Mizan pitch deck. Build: uv run python docs/submission/build.py
#let ink = oklch(23.5%, 0.018, 62deg)
#let muted = oklch(45%, 0.022, 64deg)
#let line-c = oklch(87.2%, 0.02, 80deg)
#let paper = oklch(96.8%, 0.013, 84deg)
#let card = oklch(98.6%, 0.008, 84deg)
#let primary = oklch(37%, 0.062, 166deg)
#let approve = oklch(44%, 0.1, 152deg)
#let negotiate = oklch(49%, 0.105, 64deg)
#let escalate = oklch(49%, 0.145, 33deg)

#let author = "Mohammad Albeladi"
#let role = "AI trainer, SDAIA Academy and KAUST"

#set document(title: "Mizan", author: author)
#set page(width: 33.867cm, height: 19.05cm, margin: (x: 2.2cm, top: 1.7cm, bottom: 1.5cm), fill: paper,
  footer: context {
    set text(size: 9pt, fill: muted)
    grid(columns: (1fr, auto), [Mizan · HUMAIN Future AI Builders Hackathon · Challenge 3], counter(page).display())
  })
#set text(font: "IBM Plex Sans Arabic", size: 20pt, fill: ink)
#set par(leading: 0.6em, spacing: 0.9em)
#set list(indent: 0.4em, body-indent: 0.6em, spacing: 0.75em)

#let mono(s) = text(font: "IBM Plex Mono", size: 0.85em, s)

// Every content slide: a short kicker and a title at the top, the body centred in the space below.
#let slide(kicker, title, body) = {
  block(below: 0.4em, text(size: 14pt, fill: primary, weight: "medium", kicker))
  block(below: 0pt, text(size: 34pt, weight: "semibold", title))
  v(1fr)
  body
  v(1.35fr)
  pagebreak(weak: true)
}

#let card-box(body, inset: 18pt) = block(fill: card, stroke: 0.6pt + line-c, radius: 6pt, inset: inset, width: 100%, body)
#let head(s) = block(below: 0.35em, text(weight: "semibold", s))
#let note(s, size: 17pt) = text(size: size, fill: muted, s)
#let point(t, d) = [#head(t) #note(d)]
#let route(name, color, body) = card-box[
  #block(below: 0.4em, text(size: 26pt, weight: "semibold", fill: color, name))
  #note(body)
]
// Oversized text is measured by cap height, so give it its own box with the descent included.
#let display(s, size) = box(height: size * 1.05, align(bottom, text(size: size, top-edge: "ascender", bottom-edge: "descender", s)))
#let big(n, label, color: ink) = stack(dir: ttb, spacing: 8pt,
  display(text(weight: "semibold", fill: color, n), 46pt),
  note(label, size: 15pt),
)

// 1. Title
#v(1fr)
#grid(columns: (auto, 1fr), column-gutter: 30pt, align: horizon,
  image("../../src/hack/assets/logo.svg", width: 4.4cm),
  stack(dir: ttb, spacing: 14pt,
    display([#text(weight: "semibold")[Mizan] #h(14pt) #text(size: 48pt, fill: primary)[ميزان]], 60pt),
    text(size: 22pt, fill: muted)[An agent that owns contract review, and knows when not to decide],
  ))
#v(1.2fr)
#note(size: 20pt)[
  Reads Arabic, English and bilingual contracts, typed or scanned. Checks every clause against the
  buyer's playbook. Approves, negotiates with a redline, or escalates to a lawyer with the exact question.
]
#v(0.8cm)
#note(size: 16pt)[#text(fill: ink, weight: "medium", author) · #role · 30–31 October 2026]
#v(0.3fr)
#pagebreak()

// 2. The issue
#slide[The issue][Legal reads every contract by hand, and most of them are routine][
  #grid(columns: (1fr, 1fr), column-gutter: 1.4cm, align: horizon,
    [
      - Supplier contracts arrive in Arabic, English or both, often as scans.
      - Lawyers spend their time confirming that routine contracts are routine.
      - The risky ones look like the routine ones: an uncapped liability, a monthly late charge, data sent abroad.
    ],
    card-box(inset: 24pt)[
      #head[The expensive mistake is a confident approval.]
      #note[Automating review is easy. Automating it so that nothing risky is signed without a lawyer
      is the problem we set out to solve, and the number we measure first.]
    ])
]

// 3. Solution
#slide[Our solution][Every contract ends in one of three routes, decided by code][
  #grid(columns: (1fr, 1fr, 1fr), column-gutter: 0.7cm,
    route("Approve", approve)[Meets the playbook, and the evidence is on record: every clause read, the cap on our liability quoted. No one touches it.],
    route("Negotiate", negotiate)[Major deviations. Mizan writes the redline and the message to the counterparty, citing the contract's own article numbers.],
    route("Escalate", escalate)[Critical risk, a missing clause, an injected instruction, a doubtful scan. A lawyer gets it with the exact question.],
  )
  #v(0.9cm)
  #note(size: 20pt)[The model reads, types clauses and records findings with verbatim quotes. It never chooses the route.]
]

// 4. How it works
#slide[How it works][Upload, check every clause, route][
  #grid(columns: (1fr, 1fr, 1fr), column-gutter: 0.9cm,
    ..(("1", "Bring any contract", "PDF, Word, text, scan or photo. Scans are read by local OCR and the confidence is kept.", "step-1-upload.png"),
       ("2", "Every clause checked", "Findings quote the contract word for word, with the playbook's wording as a redline.", "step-2-findings.png"),
       ("3", "Code routes it", "Severity and route come from code. A critical finding never approves.", "step-3-route.png"),
    ).map(((n, t, d, img)) => [
      #block(below: 0.6em, align(center, image(img, height: 7.4cm)))
      #head[#text(fill: primary, n) #h(6pt) #t]
      #note(d, size: 16pt)
    ]))
]

// 5. Trust
#slide[Why the route can be trusted][Approval needs evidence, not just no findings][
  #grid(columns: (1fr, 1fr), column-gutter: 1.4cm, row-gutter: 1cm,
    point[Code owns the decision.][A critical finding never approves or negotiates, whatever the model writes.],
    point[Two detectors.][Arabic and English red-flag patterns run without the model. Critical flags always escalate; others must be recorded or cleared with a quote.],
    point[Evidence of coverage.][Every page read, every clause typed, liability and governing law present, the words capping our liability quoted and verified.],
    point[Doubt goes to a lawyer.][Low OCR confidence, an unclear clause, an instruction aimed at the reviewer, or a run that never finished.],
  )
]

// 6. Results
#slide[Task performance on unseen cases][No risky contract approved, on any suite][
  #let th(s) = text(size: 14pt, fill: muted, s)
  #let what(s) = text(size: 16pt, s)
  #table(columns: (2.1fr, 3.6fr, 1fr, 1.2fr, 1.1fr), stroke: none, inset: (x: 8pt, y: 10pt), align: (x, y) => if x >= 2 and y > 0 { horizon } else { horizon + left },
    table.hline(stroke: 0.6pt + line-c),
    th[Suite], th[What it is], th[Routes right], th[Wrongly approved], th[Per contract],
    table.hline(stroke: 0.6pt + line-c),
    [Main], what[12 contracts we wrote and tuned on], [12/12], [*0/9*], [\$0.052],
    [Held-out, blind], what[12 by a separate agent that never saw our patterns], [12/12], [*0/8*], [\$0.053],
    [Second blind batch], what[8 new industries, labels committed before the only run], [8/8], [*0/6*], [\$0.054],
    [Real contracts], what[15 public: SEC filings, Zoom and Dropbox terms, Saudi government contracts in Arabic up to 101 pages], [14/14], [*0/14*], [\$0.23],
    table.hline(stroke: 0.6pt + line-c),
  )
  #v(0.5cm)
  #note(size: 15pt)[Claude Sonnet 5.5, effort medium. All 7 issues marked by outside annotators (CUAD, CLAUDETTE) found. About 17 s per typical contract.]
]

// 7. Iteration
#slide[Evaluation and iteration][Real contracts, first run: 5 wrongly approved][
  #grid(columns: (1fr, 1.25fr), column-gutter: 1.6cm, align: horizon,
    grid(columns: (1fr, 1fr), row-gutter: 1cm, column-gutter: 0.8cm,
      big("5/14", "wrongly approved on the blind first run", color: escalate),
      big("0/14", "after one general fix", color: approve),
      big("57%", "routes right on the first run"),
      big("100%", "after, with the other suites re-checked"),
    ),
    [
      On Saudi buyer-side contracts the agent read the *supplier's* uncapped liability as the liability clause,
      so nothing capped *ours*, and code approved.

      *The fix is a rule, not a patch to the wording:* approval now needs the words that cap our liability,
      quoted and verified by code. Without them the contract escalates.

      #note(size: 16pt)[Labels came first on every suite. Our red-flag patterns catch 12/12 on the suite they were
      written for and 1/13 blind; we reported that rather than tune them to the test.]
    ])
]

// 8. Robustness
#slide[Robustness and adaptation][Another company's rules, Arabic scans, weaker models][
  #grid(columns: (1fr, 1fr, 1fr), column-gutter: 0.7cm,
    card-box[#head[A new playbook from a file] #note[A different buyer's payment and termination rules, no code change: 8/8, both expected route changes, 0/5 wrong approvals.]],
    card-box[#head[Scans and photos] #note[A clean Arabic scan (87% OCR confidence) routes like the typed original. A blurry photo (64%) goes to a lawyer.]],
    card-box[#head[A local model] #note[qwen3:14b went from 3/9 wrong approvals to 0/9 with the safeguards. Blind, it still approved 2/8, so local mode needs a lawyer on every contract. We say so.]],
  )
  #v(0.9cm)
  #note(size: 20pt)[Lawyers' decisions become proposed playbook amendments a human accepts; critical rules never relax.]
]

// 9. Engineering
#slide[Engineering][Built to be checked][
  #grid(columns: (1fr, 1fr), column-gutter: 1.6cm,
    [
      - FastAPI and a tool loop with a turn cap, USD budget and a JSONL trace per run
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
]

// 10. Limits
#slide[What it does not do yet][Stated, not hidden][
  - Playbook rules are illustrative, not legal advice; most labels are ours (7 real-contract labels come from outside annotators).
  - The real Saudi contracts are all buyer paper, so approving a real compliant contract is untested.
  - Risky Arabic contracts are measured only on our synthetic suites: no public labelled source exists.
  - The OCR gate is calibrated on three sample scans; handwriting, stamps and signatures are not read.
  - Suites are 8 to 15 contracts: strong signals, not a benchmark.
  #v(1cm)
  #text(size: 22pt, weight: "semibold")[The model reads. Code decides. Anything uncertain goes to a lawyer.]
]
