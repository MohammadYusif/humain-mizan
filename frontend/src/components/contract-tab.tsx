import { Flag, ShieldAlert } from "lucide-react"
import { cn } from "cn"
import { useEffect, useRef, useState, type ReactNode } from "react"

import { LangChips } from "@/components/new-review-panel"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import type { Contract, Finding, Lang, Severity, Tripwire } from "@/lib/api"
import { contractTitle, langOf, plural, SEVERITY_ORDER } from "@/lib/format"
import { SEVERITY_TONE } from "@/lib/tones"
import { OcrNote } from "@/components/upload-contract-dialog"

export interface ClauseFocus {
  id: string
  nonce: number
}

/** Wrap verbatim quotes inside the clause text in <mark>. Quotes that do not match exactly are left alone. */
function withQuotes(text: string, quotes: string[]): ReactNode {
  const qs = quotes.filter((q) => q.length > 3 && text.includes(q)).sort((a, b) => b.length - a.length)
  if (qs.length === 0) return text
  const out: ReactNode[] = []
  let rest = text
  let k = 0
  while (rest.length > 0) {
    let best: { i: number; q: string } | null = null
    for (const q of qs) {
      const i = rest.indexOf(q)
      if (i >= 0 && (!best || i < best.i)) best = { i, q }
    }
    if (!best) {
      out.push(rest)
      break
    }
    if (best.i > 0) out.push(rest.slice(0, best.i))
    out.push(
      <mark key={k++} className="rounded-sm bg-highlight px-0.5 text-foreground [box-decoration-break:clone]">
        {best.q}
      </mark>
    )
    rest = rest.slice(best.i + best.q.length)
  }
  return out
}

interface Props {
  contract: Contract | null
  loading: boolean
  error: string | null
  findings: Finding[]
  clauseMap: Record<string, string[]> | null
  focus: ClauseFocus | null
  injected: string[]
  tripwires: Tripwire[]
}

export function ContractTab({ contract, loading, error, findings, clauseMap, focus, injected, tripwires }: Props) {
  const [pulsing, setPulsing] = useState<ClauseFocus | null>(null)
  const refs = useRef(new Map<string, HTMLLIElement>())

  useEffect(() => {
    if (!focus || !contract) return
    const el = refs.current.get(focus.id)
    if (!el) return
    // Wait one frame so the tab panel is laid out before scrolling.
    const raf = requestAnimationFrame(() => {
      el.scrollIntoView({ behavior: "smooth", block: "center" })
      el.focus({ preventScroll: true })
      setPulsing(focus)
    })
    const t = setTimeout(() => setPulsing(null), 1800)
    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(t)
    }
  }, [focus, contract])

  if (error) {
    return (
      <Empty className="border bg-card">
        <EmptyHeader>
          <EmptyTitle>Contract unavailable</EmptyTitle>
          <EmptyDescription>{error}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }
  if (!contract || loading) {
    return (
      <Card className="gap-4 p-6 sm:p-8">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-8 w-4/5" />
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex flex-col gap-2 pt-4">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-11/12" />
          </div>
        ))}
      </Card>
    )
  }

  const byClause = new Map<string, Finding[]>()
  for (const f of findings) byClause.set(f.clause_id, [...(byClause.get(f.clause_id) ?? []), f])
  const title = contractTitle(contract.title)
  const languages = [...new Set(contract.clauses.map((c) => c.lang))].sort() as Lang[]

  return (
    <Card className="gap-0 p-0">
      <header className="border-b px-5 py-6 sm:px-8 sm:py-8">
        <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="font-mono">{contract.doc_id}</span>
          <span aria-hidden>·</span>
          <span className="tabular">{plural(contract.clauses.length, "clause")}</span>
          <LangChips languages={languages} />
          {findings.length > 0 ? (
            <>
              <span aria-hidden>·</span>
              <span className="tabular">
                {byClause.size} clause{byClause.size === 1 ? "" : "s"} flagged
              </span>
            </>
          ) : null}
        </div>
        <h2 dir="auto" lang={langOf(title.primary)} className="text-2xl leading-snug font-semibold sm:text-[1.75rem]">
          {title.primary}
        </h2>
        {title.secondary ? (
          <p dir="auto" lang={langOf(title.secondary)} className="mt-2 font-heading text-lg text-muted-foreground">
            {title.secondary}
          </p>
        ) : null}
        {contract.ocr ? (
          <div className="mt-4">
            <OcrNote ocr={contract.ocr} />
          </div>
        ) : null}
      </header>
      <ol className="divide-y">
        {contract.clauses.map((cl) => {
          const fs = byClause.get(cl.id) ?? []
          const worst: Severity | null = SEVERITY_ORDER.find((s) => fs.some((f) => f.severity === s)) ?? null
          const types = clauseMap?.[cl.id] ?? []
          const isInjected = injected.includes(cl.id)
          const flags = tripwires.filter((t) => t.clause_id === cl.id)
          const criticalFlag = flags.some((t) => t.critical)
          return (
            <li
              key={cl.id}
              id={`clause-${cl.id}`}
              tabIndex={-1}
              ref={(el) => {
                if (el) refs.current.set(cl.id, el)
                else refs.current.delete(cl.id)
              }}
              className={cn(
                "scroll-mt-28 px-5 py-5 outline-none transition-colors duration-700 sm:px-8",
                worst && "bg-[color-mix(in_oklch,var(--highlight)_22%,transparent)]",
                // Jumping here from a finding: a brief tint marks the target clause (no animation loop).
                pulsing?.id === cl.id && "bg-[color-mix(in_oklch,var(--brass)_18%,transparent)]"
              )}
            >
              <div className="mb-2 flex flex-wrap items-center gap-1.5">
                {worst || criticalFlag || flags.some((t) => t.status === "unresolved") ? (
                  <span
                    aria-hidden
                    className={cn(
                      "size-2 rounded-[2px]",
                      worst ? SEVERITY_TONE[worst].dot : criticalFlag ? "bg-escalate" : "bg-negotiate"
                    )}
                  />
                ) : null}
                <span className="me-1 font-mono text-xs font-medium text-muted-foreground">{cl.id}</span>
                {types
                  .filter((t) => t !== "Other")
                  .map((t) => (
                    <Badge key={t} variant="secondary" className="rounded-md font-normal">
                      {t}
                    </Badge>
                  ))}
                {types.includes("Other") ? (
                  <Badge variant="outline" className="rounded-md font-normal text-muted-foreground">
                    Other
                  </Badge>
                ) : null}
                {isInjected ? (
                  <Badge variant="outline" className="gap-1 rounded-md border-escalate/40 bg-escalate-soft text-escalate">
                    <ShieldAlert data-icon="inline-start" aria-hidden />
                    Instruction to AI reviewer, ignored
                  </Badge>
                ) : null}
                {flags.map((t) => (
                  <Badge
                    key={`flag-${t.rule_id}`}
                    variant="outline"
                    title={`Red flag matched: “${t.match}”`}
                    className={cn(
                      "gap-1 rounded-md text-[0.7rem]",
                      t.critical
                        ? "border-escalate bg-escalate text-paper"
                        : t.status === "unresolved"
                          ? "border-negotiate/50 bg-negotiate-soft text-negotiate"
                          : "border-dashed text-muted-foreground"
                    )}
                  >
                    <Flag data-icon="inline-start" aria-hidden />
                    {t.critical ? "Critical red flag" : "Red flag"} · <span className="font-mono">{t.rule_id}</span>
                    {!t.critical ? <span className="opacity-80">({t.status})</span> : null}
                  </Badge>
                ))}
                {fs.map((f) => (
                  <Badge
                    key={f.rule_id}
                    variant="outline"
                    className={cn("gap-1 rounded-md font-mono text-[0.7rem]", SEVERITY_TONE[f.severity].badge)}
                  >
                    <span aria-hidden className={cn("size-1.5 rounded-full", SEVERITY_TONE[f.severity].dot)} />
                    {f.rule_id}
                    <span className="sr-only">({f.severity} finding)</span>
                  </Badge>
                ))}
              </div>
              <p dir="auto" lang={cl.lang} className="max-w-[68ch] font-heading text-[1.05rem] leading-relaxed text-foreground">
                {withQuotes(
                  cl.text,
                  fs.map((f) => f.quote)
                )}
              </p>
            </li>
          )
        })}
      </ol>
    </Card>
  )
}
