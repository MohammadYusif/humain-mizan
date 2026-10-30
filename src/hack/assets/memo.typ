// Decision memo: the route and why, what happened next, the agent's memo, findings, red flags.
#import "base.typ": *
#let d = json("data.json")
#show: setup.with(title: "Review memo: " + d.title, footer-note: d.disclaimer)

#brand("Contract review memo", d.doc_id)
#v(0.2em)
#text(size: 16pt, weight: "semibold", lang-text(d.title, d.title_lang))
#v(0.2em)
#text(size: 8.5pt, fill: muted, d.meta)

#v(0.8em)
#block(width: 100%, inset: 10pt, radius: 4pt, fill: soft.at(d.route, default: soft.plain), grid(
  columns: (auto, 1fr, auto),
  column-gutter: 14pt,
  align: (left + horizon, left + horizon, right + horizon),
  text(size: 18pt, weight: "bold", fill: tone.at(d.route, default: tone.plain), d.route_label),
  text(size: 9pt, d.route_description),
  {
    set text(size: 8.5pt)
    [Risk score #text(weight: "semibold", d.risk)]
    linebreak()
    d.counts
  },
))

#if d.reasons.len() > 0 {
  v(0.5em)
  label("Why")
  list(..d.reasons.map(r => text(size: 9pt, r)))
}

#if d.action != "" {
  v(0.3em)
  label("What happened next")
  linebreak()
  text(size: 9pt, d.action)
}

#if d.data != "" {
  v(0.3em)
  label("Data handling")
  linebreak()
  text(size: 9pt, d.data)
}

#if d.source != "" {
  v(0.3em)
  label("Source text")
  linebreak()
  text(size: 9pt, d.source)
}

#if d.memo.len() > 0 {
  section("Agent's memo")
  for p in d.memo {
    if p.bullet {
      list(lang-text(p.text, p.lang))
    } else {
      par(lang-text(p.text, p.lang))
    }
  }
}

#section("Findings")
#if d.findings.len() == 0 [
  No playbook deviations recorded.
] else {
  set text(size: 8.5pt)
  table(
    columns: (3.6em, 7.4em, 1fr, 1fr),
    stroke: (x, y) => if y == 0 { (bottom: 0.6pt + ink) } else { (bottom: 0.4pt + rule-line) },
    inset: (x: 4pt, y: 5pt),
    table.header(label("Clause"), label("Rule"), label("Quote from the contract"), label("Proposed wording")),
    ..d.findings.map(f => (
      mono(f.clause_id),
      {
        box(text(weight: "semibold", f.rule_id))
        linebreak()
        tag(f.severity, f.severity)
      },
      {
        lang-text(f.quote, f.quote_lang)
        v(0.2em)
        text(fill: muted, f.issue)
      },
      lang-text(f.redline, f.redline_lang),
    )).flatten(),
  )
}

#if d.flags.len() > 0 {
  section("Deterministic red flags")
  text(size: 8.5pt, fill: muted, "Pattern checks that run independently of the model.")
  v(0.2em)
  set text(size: 8.5pt)
  table(
    columns: (3.6em, 7.4em, 5.6em, 1fr),
    stroke: (x, y) => if y == 0 { (bottom: 0.6pt + ink) } else { (bottom: 0.4pt + rule-line) },
    inset: (x: 4pt, y: 5pt),
    table.header(label("Clause"), label("Rule"), label("Status"), label("Matched text")),
    ..d.flags.map(t => (
      mono(t.clause_id),
      box(text(weight: "semibold", t.rule_id)),
      tag(t.status, t.tone),
      lang-text(t.match, t.match_lang),
    )).flatten(),
  )
}
