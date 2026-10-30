// Redline: the full contract, each offending quote struck through, the playbook wording proposed
// beneath the clause with the rule and the reason.
#import "base.typ": *
#let d = json("data.json")
#show: setup.with(title: "Redline: " + d.title, footer-note: d.disclaimer)

#label("Redline · " + d.doc_id)
#v(0.2em)
#text(size: 16pt, weight: "semibold", lang-text(d.title, d.title_lang))
#v(0.3em)
#tag(d.route_label, d.route) #h(6pt) #text(size: 8.5pt, fill: muted, d.meta)
#if d.source != "" {
  v(0.2em)
  text(size: 8.5pt, fill: muted, d.source)
}

#v(0.6em)
#block(
  width: 100%,
  inset: (x: 8pt, y: 6pt),
  radius: 3pt,
  fill: paper-tint,
  text(size: 8.5pt)[
    #strike(stroke: 0.7pt + del-color, text(fill: del-color, "Struck text")) is what we ask to remove.
    #h(6pt)
    #underline(stroke: 0.6pt + ins-color, text(fill: ins-color, "Underlined text")) is the wording we propose instead.
    #h(6pt) #d.summary
  ],
)

#v(0.4em)
// Arabic clauses read right to left, so their number sits on the right (Typst grids follow the
// text direction) and their notes are indented from the right.
#for c in d.clauses {
  set text(lang: c.lang)
  block(breakable: true, above: 0.9em, below: 0.4em, grid(
    columns: (2.4em, 1fr),
    column-gutter: 6pt,
    mono(c.id),
    {
      for s in c.segments {
        if s.del {
          strike(stroke: 0.7pt + del-color, text(fill: del-color, s.text))
        } else {
          s.text
        }
      }
    },
  ))
  for f in c.findings {
    block(breakable: true, above: 0.4em, below: 0.6em, pad(..if c.lang == "ar" { (right: 2.4em + 6pt) } else { (left: 2.4em + 6pt) }, block(
      width: 100%,
      inset: (x: 8pt, y: 7pt),
      radius: 3pt,
      stroke: 0.5pt + rule-line,
      {
        set text(lang: "en")
        tag(f.severity, f.severity)
        h(5pt)
        text(size: 8.5pt, weight: "semibold", f.rule_id)
        h(5pt)
        text(size: 8.5pt, fill: muted, f.clause_type)
        v(0.25em)
        text(size: 9pt, f.issue)
        v(0.2em)
        label("Proposed wording")
        linebreak()
        lang-text(underline(stroke: 0.6pt + ins-color, text(fill: ins-color, f.redline)), f.redline_lang)
      },
    )))
  }
}
