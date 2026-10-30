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
#let redaction-result = "12/12 routes right and 0/9 risky contracts approved on the main suite, the same as with names shown"

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
#let kicker(s) = block(below: 0.4em, text(size: 14pt, fill: primary, weight: "medium", s))

// Every content slide: a short kicker and a title at the top, the body centred in the space below.
#let slide(kicker-text, title, body) = {
  kicker(kicker-text)
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

// Flow diagram pieces: a box with a heading, a horizontal arrow, an upward arrow.
#let fbox(title, body, h: auto) = block(width: 100%, height: h, fill: card, stroke: 0.6pt + line-c, radius: 6pt, inset: 12pt, {
  block(below: 0.35em, text(size: 16pt, weight: "semibold", title))
  text(size: 15pt, fill: muted, body)
})
#let harrow = box(width: 100%, height: 12pt, {
  place(horizon + left, line(length: 100%, stroke: 1.2pt + muted))
  place(horizon + right, polygon(fill: muted, (0pt, 0pt), (9pt, 6pt), (0pt, 12pt)))
})
#let uarrow(h) = box(width: 100%, height: h, {
  place(top + center, polygon(fill: muted, (6pt, 0pt), (12pt, 9pt), (0pt, 9pt)))
  place(top + center, dy: 6pt, line(angle: 90deg, length: h - 6pt, stroke: 1.2pt + muted))
})

// 1. Project overview (title slide)
#kicker[Project overview · Challenge 3: Autonomous Enterprise]
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

// 2. Problem statement
#slide[Problem statement][Legal reads every contract by hand, and most of them are routine][
  #grid(columns: (1fr, 1fr), column-gutter: 1.4cm, align: horizon,
    [
      - Supplier contracts arrive in Arabic, English or both, often as scans.
      - Lawyers spend their time confirming that routine contracts are routine.
      - The risky ones look like the routine ones: an uncapped liability, a monthly late charge, personal data sent abroad.
    ],
    card-box(inset: 24pt)[
      #head[The expensive mistake is a confident approval.]
      #note[Automating review is easy. Automating it so that nothing risky is signed without a lawyer
      is the problem we set out to solve, and the number we measure first. Most tools leave that
      decision to the model.]
    ])
]

// 3. Proposed solution
#slide[Proposed solution][Every contract ends in one of three routes, decided by code][
  #grid(columns: (1fr, 1fr, 1fr), column-gutter: 0.7cm,
    route("Approve", approve)[Meets the playbook, and the evidence is on record: every clause read, the cap on our liability quoted. No one touches it.],
    route("Negotiate", negotiate)[Major deviations. Mizan writes the redline and the message to the counterparty, citing the contract's own article numbers.],
    route("Escalate", escalate)[Critical risk, a missing clause, an injected instruction, a doubtful scan. A lawyer gets it with the exact question.],
  )
  #v(0.9cm)
  #note(size: 20pt)[The model reads, types clauses and records findings with verbatim quotes. It never chooses the route. Only escalations reach the lawyers' inbox.]
]

// 4. Technical approach
#slide[Technical approach][The model reads; code decides][
  #let h1 = 5.4cm
  #let h3 = 3.3cm
  #let routes = stack(dir: ltr, spacing: 8pt,
    text(size: 15pt, weight: "semibold", fill: approve)[Approve],
    text(size: 15pt, weight: "semibold", fill: negotiate)[Negotiate],
    text(size: 15pt, weight: "semibold", fill: escalate)[Escalate])
  #grid(columns: (1fr, 0.6cm, 0.9fr, 0.6cm, 1.9fr, 0.6cm, 1.5fr), column-gutter: 3pt, row-gutter: 0pt, align: horizon,
    fbox("Upload", h: h1)[PDF, Word, text, scan or photo. Local OCR in Arabic and English, confidence kept.],
    harrow,
    fbox("Clauses", h: h1)[Split by clause, each with its page and source.],
    harrow,
    fbox("Agent loop", h: h1)[Claude Sonnet 5.5. Tools: type each clause against the playbook, record findings with verbatim quotes, confirm our liability cap, send the redline.],
    harrow,
    fbox("Routing in code", h: h1)[Severity and route from findings, red flags, coverage and OCR confidence. A critical finding never approves. #v(0.5em) #routes],
    [], [], [], [], uarrow(0.8cm), [], uarrow(0.8cm),
    [], [], [], [],
    fbox("Data policy gate", h: h3)[Label and model location checked before any call; identifiers hidden from external models.],
    [],
    fbox("Red-flag patterns", h: h3)[Arabic and English, with no model. A critical flag always escalates.],
  )
  #v(0.6cm)
  #note(size: 15pt)[Models: Claude Sonnet 5.5, effort medium, through the Anthropic SDK; or a local model through an OpenAI-compatible server (qwen3:14b measured).
  Every run has a turn cap, a USD budget and a JSONL trace. Python 3.12, FastAPI, React with Tailwind and shadcn/ui, Tesseract OCR, Typst PDFs, one Docker image.]
]

// 5. Implementation
#slide[Implementation][Upload, check every clause, route][
  #grid(columns: (1fr, 1fr, 1fr), column-gutter: 0.9cm,
    ..(("1", "Bring any contract", "PDF, Word, text, scan or photo. Scans are read by local OCR and the confidence is kept.", "step-1-upload.png"),
       ("2", "Every clause checked", "Findings quote the contract word for word, with the playbook's wording as a redline.", "step-2-findings.png"),
       ("3", "Code routes it", "Severity and route come from code. A critical finding never approves.", "step-3-route.png"),
    ).map(((n, t, d, img)) => [
      #block(below: 0.6em, align(center, image(img, height: 6.8cm)))
      #head[#text(fill: primary, n) #h(6pt) #t]
      #note(d, size: 16pt)
    ]))
  #v(0.7cm)
  #note(size: 16pt)[Also built: a lawyers' inbox that holds only escalations, a batch queue with an auto-send policy, redline and memo PDFs typeset from data, a Proof screen with every result, Mizan's own sign-in (lowering a label takes the signed-in account and a fixed answer per finding; one review at a time per contract; Restricted contracts and their reviews open only for Legal), and a guided demo that replays recorded runs.]
]

// 6. Testing and results
#slide[Testing and results][59 contracts, 27 real, every answer key written first][
  #let th(s) = text(size: 13pt, fill: muted, s)
  #let what(s) = text(size: 14pt, s)
  #set text(size: 16pt)
  #note(size: 15pt)[Answer keys are written by reviewers who never saw Mizan's output and committed to git before the run. Code grades
  every run, and every result file is kept, the failed first runs too. The newest real batch was also picked by a rule.]
  #v(0.3cm)
  #table(columns: (1.75fr, 4.6fr, 0.95fr, 1.05fr, 0.8fr, 0.85fr), stroke: none, inset: (x: 7pt, y: 7pt), align: (x, y) => if x >= 2 and y > 0 { horizon } else { horizon + left },
    table.hline(stroke: 0.6pt + line-c),
    th[Test set], th[What it is (current version, Claude Sonnet 5.5)], th[Routes right], th[Risky approved], th[Recall], th[Per contract],
    table.hline(stroke: 0.6pt + line-c),
    [Main, 4 runs], what[12 we wrote and tuned on; the same result in every run], [48/48], [*0/36*], [100%], [\$0.04],
    [Held-out], what[12 by a separate agent; 11/12 on its first run, then one fix], [12/12], [*0/8*], [92%], [\$0.05],
    [Held-out 2], what[8 more, new industries; run once, blind], [8/8], [*0/6*], [100%], [\$0.05],
    [Real], what[15 public, Arabic up to 101 pages; after the fix on slide 9], [14/14], [*0/14*], [73%], [\$0.23],
    [*Real 2*], what[12 SEC filings picked by a rule; run once, blind], [11/12], [*0/12*], [66%], [\$0.18],
    table.hline(stroke: 0.6pt + line-c),
  )
  #v(0.3cm)
  #note(size: 14pt)[Names hidden from the model: 12/12, 0/9, unchanged. Another company's playbook from a file: 8/8, 0/5. On real contracts
  it catches liability, interest, indemnity and non-compete issues and misses many termination and payment-term ones.]
]

// 7. Innovation and value
#slide[Innovation and value][Approval needs evidence, not just no findings][
  #grid(columns: (1.35fr, 1fr), column-gutter: 1.6cm, align: horizon,
    grid(columns: (1fr, 1fr), column-gutter: 0.8cm, row-gutter: 0.9cm,
      point[Code decides.][A critical finding never approves or negotiates, whatever the model writes.],
      point[Two detectors.][Arabic and English red-flag patterns run without the model. A critical flag cannot be argued away.],
      point[Coverage, proven.][Every page read, every clause typed, the words capping our liability quoted and verified.],
      point[Doubt escalates.][Low OCR confidence, an unclear clause, an instruction aimed at the reviewer, an unfinished run.],
    ),
    card-box(inset: 22pt)[
      #head[What it is worth]
      #set text(size: 16pt, fill: muted)
      #set list(spacing: 0.6em)
      - Lawyers see only what needs them; routine contracts are approved with the evidence on record.
      - About 5 cents and 17 seconds for a typical contract.
      - Arabic and bilingual contracts, and scans read by local OCR with the confidence kept.
      - Another buyer's rules load from a file; lawyers' decisions become proposed amendments a person accepts.
    ])
]

// 10. Data policy (placed after Innovation and value)
#slide[Innovation and value · data policy][Confidential contracts never leave][
  #let th(s) = text(size: 14pt, fill: muted, s)
  #let lbl(s) = text(weight: "semibold", s)
  #let cell(s) = text(size: 16pt, s)
  #let sug(s) = block(above: 6pt, text(size: 13pt, fill: muted, s))
  #table(columns: (1.5fr, 2.2fr, 2.2fr), stroke: none, inset: (x: 10pt, y: 7pt), align: horizon + left,
    table.hline(stroke: 0.6pt + line-c),
    th[Label, suggested from the text], th[External model (API outside the network)], th[Model in the network (local or HUMAIN)],
    table.hline(stroke: 0.6pt + line-c),
    [#lbl[Public] #sug[for a blank template]], cell[Reviewed as is.], cell[Reviewed as is.],
    [#lbl[Internal] #sug[for names, emails, account numbers]], cell[Identifiers become placeholders before sending, and are put back in what people read and send.], cell[Reviewed as is.],
    [#lbl[Restricted] #sug[for a confidential marking, an NDA, health data]], cell[No model call at all. It goes straight to a lawyer, with the reason.], cell[Reviewed, but never approved or sent automatically.],
    table.hline(stroke: 0.6pt + line-c),
  )
  #v(0.45cm)
  #note(size: 15pt)[The label is suggested on this server before any model sees the contract; making it looser is recorded as a person's decision.
  Enforced twice in code, before the run and in the tool that serves contract text. Every review records the label, how it was set and what was hidden.]
  #v(0.35cm)
  #note(size: 15pt)[Review quality with identifiers hidden: #text(fill: ink, weight: "medium", redaction-result)]
]

// 8. Challenges and future improvements
#slide[Challenges and future improvements][The first real run approved 5 of 14. One rule fixed it.][
  #grid(columns: (1fr, 1.3fr), column-gutter: 1.6cm, align: horizon,
    [
      #grid(columns: (1fr, 1fr), column-gutter: 0.8cm, align: top,
        big("5/14", "wrongly approved on the blind first run", color: escalate),
        big("0/14", "after one general rule", color: approve),
      )
      #v(0.5cm)
      #note(size: 16pt)[On Saudi buyer-side paper the agent read the *supplier's* uncapped liability as the liability clause, so
      nothing capped *ours*. Approval now needs the words that cap our liability, quoted and verified by code; without them
      the contract escalates. The earlier suites were re-run afterwards and held. Then 12 new real contracts it had never
      seen, run once and blind: none approved.]
    ],
    [
      #let sub(s) = block(below: 0.35em, text(size: 20pt, weight: "semibold", fill: ink, s))
      #sub[Key limitations]
      #set text(size: 15pt, fill: muted)
      #set list(spacing: 0.45em)
      - Playbook rules are illustrative, not legal advice. 15 labels come from outside annotators; the rest are ours.
      - Recall on real contracts is 66-73%: the routes are safe, but the issue list is not complete.
      - No real contract in our sets should be approved, so approving a real compliant one is untested.
      - Red-flag patterns catch 1/13 blind; a local model approved 2/8, so local mode needs a lawyer.
      - The OCR gate is calibrated on three sample scans; handwriting, stamps and signatures are not read.
      #v(0.45cm)
      #sub[Next]
      - Lawyer-validated labels, including risky Arabic contracts.
      - Real compliant contracts, so approvals are tested too.
      - Better recall on termination and payment terms.
    ])
]

// 9. Conclusion
#slide[Conclusion][The model reads. Code decides. Anything uncertain goes to a lawyer.][
  #grid(columns: (1.3fr, 1fr), column-gutter: 1.6cm, align: horizon,
    [
      #set text(size: 17pt)
      - Beyond the main suite, 47 contracts, 27 of them real: the current version gets 45 of 46 routes right and approves 0 of 40 risky ones, including the newest 12, run once and blind.
      - Arabic, English and bilingual, typed or scanned, up to 101 pages read by OCR.
      - Another buyer's rules from a file, a local model option, and confidential contracts that never leave.
      - The main suite gives the same result in 4 runs; 126 tests with no API calls; every number here is reproducible from the repo and on the Proof screen.
    ],
    card-box(inset: 22pt)[
      #head[In the app]
      #note(size: 16pt)[Sign in with your own account. Guided demo replays four recorded runs, labelled Replay, with no key and no network.
      Proof shows every result above, run by run. Upload your own contract to see its label, its findings and its route.]
    ])
]
