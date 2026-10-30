import { Fragment } from "react"

import { langOf } from "@/lib/format"

/** Minimal, safe rendering of the agent's markdown-ish prose: paragraphs, "- " bullets and **bold**. No HTML. */
function inline(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") && part.length > 4 ? (
      <strong key={i} className="font-semibold text-foreground">
        {part.slice(2, -2)}
      </strong>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    )
  )
}

export function RichText({ text, className }: { text: string; className?: string }) {
  const blocks = text.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean)
  return (
    <div className={className}>
      {blocks.map((block, i) => {
        const lines = block.split("\n")
        if (lines.every((l) => /^\s*[-*•]\s+/.test(l))) {
          return (
            <ul key={i} className="my-2 flex list-disc flex-col gap-1 ps-5 marker:text-muted-foreground">
              {lines.map((l, j) => {
                const t = l.replace(/^\s*[-*•]\s+/, "")
                return (
                  <li key={j} dir="auto" lang={langOf(t)}>
                    {inline(t)}
                  </li>
                )
              })}
            </ul>
          )
        }
        return (
          <p key={i} dir="auto" lang={langOf(block)} className="my-2 whitespace-pre-line first:mt-0 last:mb-0">
            {inline(block)}
          </p>
        )
      })}
    </div>
  )
}

interface Change {
  label: string | null
  /** The change as separate points: "delete X; replace with Y" reads better as two lines. */
  points: string[]
}

interface Numbered {
  lead: string
  items: Change[]
  tail: string
}

const NUMBERED_LINE = /^\s*(?:\d{1,2}[.)]|\(\d{1,2}\))\s+/
// "Art. 4: ...", "Clause 3 (Termination): ...", "المادة الرابعة: ...": a short reference before a colon.
const LABEL = /^([^:;!?\n]{1,48}?(?:\([^)]{1,40}\))?)\s*:\s+([\s\S]+)$/

function sentence(s: string) {
  const t = s.trim().replace(/[;,؛،]+$/, "")
  const capped = t.charAt(0).toUpperCase() + t.slice(1)
  return /[.!?؟]$/.test(capped) ? capped : `${capped}.`
}

function item(raw: string): Change {
  const text = raw.trim()
  const m = LABEL.exec(text)
  const [label, body] = m ? [m[1].trim(), m[2].trim()] : [null, text]
  return { label, points: body.split(/\s*[;؛]\s+/).filter(Boolean).map(sentence) }
}

/** Split a drafted message into an opening line and numbered changes, written either as numbered
 * lines or inline as "(1) ... (2) ...". Fewer than two items: not a list. */
function splitNumbered(text: string): Numbered | null {
  const lines = text.trim().split("\n")
  const first = lines.findIndex((l) => NUMBERED_LINE.test(l))
  if (first >= 0 && lines.filter((l) => NUMBERED_LINE.test(l)).length >= 2) {
    const items: string[] = []
    let i = first
    for (; i < lines.length; i++) {
      const l = lines[i]
      if (NUMBERED_LINE.test(l)) items.push(l.replace(NUMBERED_LINE, ""))
      else if (l.trim() === "") break
      else items[items.length - 1] += ` ${l.trim()}`
    }
    return {
      lead: lines.slice(0, first).join(" ").trim(),
      items: items.map(item),
      tail: lines.slice(i).join("\n").trim(),
    }
  }
  const parts = text.trim().split(/\s*\((\d{1,2})\)\s+/)
  if (parts.length >= 5 && parts.filter((_, k) => k % 2 === 1).every((n, k) => Number(n) === k + 1)) {
    const bodies = parts.filter((_, k) => k >= 2 && k % 2 === 0)
    return { lead: parts[0].trim(), items: bodies.map(item), tail: "" }
  }
  return null
}

/** A drafted message (requested changes, a question for legal), laid out for reading: the opening
 * line, then one entry per change with its article or clause reference set apart. */
export function MessageText({ text, className }: { text: string; className?: string }) {
  const n = splitNumbered(text)
  if (!n) return <RichText text={text} className={className} />
  return (
    <div className={className}>
      {n.lead ? (
        <p dir="auto" lang={langOf(n.lead)} className="mb-3 font-medium text-foreground">
          {inline(n.lead.replace(/:$/, ""))}
        </p>
      ) : null}
      <ol className="flex flex-col gap-3.5">
        {n.items.map((it, i) => {
          const lang = langOf(it.points.join(" "))
          return (
            <li key={i} className="grid grid-cols-[1.5rem_minmax(0,1fr)] items-baseline">
              <span className="text-muted-foreground tabular">{i + 1}.</span>
              <div dir="auto" lang={lang} className="flex min-w-0 flex-col gap-1">
                {it.label ? <span className="font-semibold text-foreground">{it.label}</span> : null}
                {it.points.length > 1 ? (
                  <ul className="flex list-disc flex-col gap-0.5 ps-4 marker:text-muted-foreground">
                    {it.points.map((p, j) => (
                      <li key={j}>{inline(p)}</li>
                    ))}
                  </ul>
                ) : (
                  <span>{inline(it.points[0] ?? "")}</span>
                )}
              </div>
            </li>
          )
        })}
      </ol>
      {n.tail ? <RichText text={n.tail} className="mt-3" /> : null}
    </div>
  )
}
