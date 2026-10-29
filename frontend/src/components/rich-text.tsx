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
