// Shared look for Mizan's PDF exports: the app's parchment / ink-green / brass palette, IBM Plex
// Sans Arabic (Arabic and Latin) and IBM Plex Mono. All text arrives as JSON strings, so contract
// wording is never parsed as Typst markup.

#let ink = oklch(23.5%, 0.018, 62deg)
#let muted = oklch(45%, 0.022, 64deg)
#let rule-line = oklch(87.2%, 0.02, 80deg)
#let paper-tint = oklch(96.8%, 0.013, 84deg)
#let primary = oklch(37%, 0.062, 166deg)
#let tone = (
  approve: oklch(44%, 0.1, 152deg),
  negotiate: oklch(49%, 0.105, 64deg),
  escalate: oklch(49%, 0.145, 33deg),
  critical: oklch(49%, 0.145, 33deg),
  major: oklch(49%, 0.105, 64deg),
  minor: oklch(46%, 0.04, 245deg),
  plain: oklch(45%, 0.022, 64deg),
)
#let soft = (
  approve: oklch(93.5%, 0.04, 150deg),
  negotiate: oklch(94%, 0.05, 80deg),
  escalate: oklch(93.5%, 0.035, 35deg),
  critical: oklch(93.5%, 0.035, 35deg),
  major: oklch(94%, 0.05, 80deg),
  minor: oklch(93.5%, 0.014, 245deg),
  plain: oklch(93.8%, 0.015, 82deg),
)
#let del-color = oklch(49%, 0.145, 33deg)
#let ins-color = oklch(40%, 0.1, 152deg)
#let mono(s, size: 7.5pt, fill: muted) = text(font: "IBM Plex Mono", size: size, fill: fill, s)

#let setup(title: "", footer-note: "", body) = {
  set document(title: title, author: "Mizan")
  set page(
    paper: "a4",
    margin: (x: 2.1cm, top: 1.9cm, bottom: 2.1cm),
    footer: context {
      set text(size: 7.5pt, fill: muted)
      grid(
        columns: (1fr, auto),
        footer-note,
        counter(page).display("1 of 1", both: true),
      )
    },
  )
  set text(font: "IBM Plex Sans Arabic", size: 9.5pt, fill: ink, lang: "en")
  set par(leading: 0.72em, spacing: 0.9em)
  body
}

// A run of text in its own language: Arabic gets right-to-left layout and Arabic shaping rules.
#let lang-text(s, lang) = {
  set text(lang: lang)
  s
}

#let label(s) = text(size: 7.5pt, fill: muted, s)

#let section(s) = {
  v(1.1em)
  text(size: 11pt, weight: "semibold", s)
  v(0.15em)
  line(length: 100%, stroke: 0.5pt + rule-line)
  v(0.2em)
}

#let tag(s, kind) = box(
  inset: (x: 4pt, y: 2pt),
  radius: 2pt,
  fill: soft.at(kind, default: soft.plain),
  text(size: 7.5pt, weight: "semibold", fill: tone.at(kind, default: tone.plain), s),
)
