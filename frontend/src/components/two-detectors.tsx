import { ArrowUpRight, Bot, Check, ChevronDown, Flag, ShieldAlert, TriangleAlert, Undo2 } from "lucide-react"
import { cn } from "cn"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import type { ClearedFlag, ReviewView, Tripwire, TripwireStatus } from "@/lib/api"
import { langOf, plural, SEVERITY_ORDER } from "@/lib/format"
import { SEVERITY_TONE } from "@/lib/tones"

const STATUS: Record<TripwireStatus, { label: string; badge: string; icon: typeof Flag; dot: string }> = {
  critical: {
    label: "Critical · always escalates",
    badge: "border-escalate/40 bg-escalate-soft text-escalate",
    icon: ShieldAlert,
    dot: "bg-escalate",
  },
  unresolved: {
    label: "Unresolved · forces escalation",
    badge: "border-negotiate/40 bg-negotiate-soft text-negotiate",
    icon: TriangleAlert,
    dot: "bg-negotiate",
  },
  recorded: {
    label: "Recorded as a finding",
    badge: "border-approve/30 bg-approve-soft text-approve",
    icon: Check,
    dot: "bg-approve",
  },
  cleared: {
    label: "Cleared by the reviewer",
    badge: "border-dashed text-muted-foreground",
    icon: Undo2,
    dot: "bg-muted-foreground",
  },
}

const ORDER: TripwireStatus[] = ["critical", "unresolved", "recorded", "cleared"]

function FlagRow({
  t,
  cleared,
  onJump,
}: {
  t: Tripwire
  cleared: ClearedFlag | undefined
  onJump: (clauseId: string) => void
}) {
  const s = STATUS[t.status]
  const Icon = s.icon
  const head = (
    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
      <Flag className={cn("size-3.5 shrink-0", t.critical ? "text-escalate" : "text-muted-foreground")} aria-hidden />
      <span className="font-mono text-[0.8rem] font-medium">{t.rule_id}</span>
      <Button variant="outline" size="xs" className="font-mono" onClick={() => onJump(t.clause_id)} aria-label={`Show clause ${t.clause_id}`}>
        {t.clause_id}
        <ArrowUpRight data-icon="inline-end" aria-hidden />
      </Button>
      <span dir="auto" lang={langOf(t.match)} className="min-w-0 flex-1 truncate text-xs text-muted-foreground" title={t.match}>
        “{t.match}”
      </span>
      <Badge variant="outline" className={cn("gap-1 rounded-md", s.badge)}>
        <Icon data-icon="inline-start" aria-hidden />
        {s.label}
      </Badge>
    </div>
  )
  if (t.status !== "cleared" || !cleared) return <li className="px-4 py-2.5">{head}</li>
  return (
    <li className="px-4 py-2.5">
      <Collapsible>
        <div className="flex flex-col gap-1.5">
          {head}
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="xs" className="group w-fit text-muted-foreground">
              Why it was cleared
              <ChevronDown className="transition-transform group-data-[state=open]:rotate-180" data-icon="inline-end" aria-hidden />
            </Button>
          </CollapsibleTrigger>
        </div>
        <CollapsibleContent className="mt-2 flex flex-col gap-2 rounded-lg border bg-background/60 p-3 text-sm">
          <p dir="auto" lang={langOf(cleared.reason)}>
            {cleared.reason}
          </p>
          <blockquote dir="auto" lang={langOf(cleared.quote)} className="border-s-2 border-brass ps-3 font-heading text-[0.95rem]">
            {cleared.quote}
          </blockquote>
          <p className="text-xs text-muted-foreground">Kept on record for audit; the quote was checked to be verbatim.</p>
        </CollapsibleContent>
      </Collapsible>
    </li>
  )
}

/** Compact red-flag line for Inbox cards: counts by status plus one chip per flag. */
export function RedFlagSummary({ flags }: { flags: Tripwire[] }) {
  if (!flags.length)
    return (
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Flag className="size-3.5" aria-hidden /> No red-flag pattern matched
      </p>
    )
  const sorted = [...flags].sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status))
  return (
    <div className="flex flex-col gap-1.5">
      <h3 className="font-sans text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        Red flags · pattern checks
      </h3>
      <ul className="flex flex-wrap gap-1.5">
        {sorted.map((t) => (
          <li key={`${t.clause_id}-${t.rule_id}`}>
            <Badge
              variant="outline"
              title={t.match}
              className={cn("gap-1 rounded-md font-mono text-[0.7rem] font-normal", STATUS[t.status].badge)}
            >
              <Flag data-icon="inline-start" aria-hidden />
              {t.rule_id} · {t.clause_id}
              <span className="font-sans">{t.status}</span>
            </Badge>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** The model's findings and the deterministic red flags side by side: approval needs both to agree. */
export function TwoDetectors({ review, onJump }: { review: ReviewView; onJump: (clauseId: string) => void }) {
  const flags = [...review.tripwires].sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status))
  const by = (s: TripwireStatus) => flags.filter((t) => t.status === s).length
  const scored = review.route !== null
  const sev = SEVERITY_ORDER.map((s) => [s, review.findings.filter((f) => f.severity === s).length] as const).filter(([, n]) => n)

  return (
    <Card className="gap-0 p-0">
      <div className="flex flex-col gap-1 border-b px-4 py-3.5 sm:flex-row sm:items-baseline sm:gap-3 sm:px-5">
        <h3 className="text-lg font-semibold">Two detectors</h3>
        <p className="text-sm text-muted-foreground">Approval requires the model and the deterministic checks to agree.</p>
      </div>
      <div className="grid gap-px bg-border sm:grid-cols-2">
        <div className="flex flex-col gap-1 bg-card px-4 py-3 sm:px-5">
          <span className="flex items-center gap-1.5 text-[0.7rem] font-medium tracking-wide text-muted-foreground uppercase">
            <Bot className="size-3.5" aria-hidden /> Model findings
          </span>
          <span className="font-heading text-3xl leading-tight font-semibold tabular">{review.findings.length}</span>
          <span className="flex flex-wrap gap-x-3 text-xs text-muted-foreground tabular">
            {sev.length
              ? sev.map(([s, n]) => (
                  <span key={s} className="inline-flex items-center gap-1">
                    <span aria-hidden className={cn("size-1.5 rounded-full", SEVERITY_TONE[s].dot)} />
                    {n} {s}
                  </span>
                ))
              : "Each one quotes the clause verbatim"}
          </span>
        </div>
        <div className="flex flex-col gap-1 bg-card px-4 py-3 sm:px-5">
          <span className="flex items-center gap-1.5 text-[0.7rem] font-medium tracking-wide text-muted-foreground uppercase">
            <Flag className="size-3.5" aria-hidden /> Red flags · pattern checks, no model
          </span>
          <span className="font-heading text-3xl leading-tight font-semibold tabular">{scored ? flags.length : "—"}</span>
          <span className="flex flex-wrap gap-x-3 text-xs text-muted-foreground tabular">
            {scored
              ? ORDER.map((s) => (
                  <span key={s} className={cn("inline-flex items-center gap-1", by(s) === 0 && "opacity-60")}>
                    <span aria-hidden className={cn("size-1.5 rounded-full", STATUS[s].dot)} />
                    {by(s)} {s}
                  </span>
                ))
              : "Checked when the contract is scored"}
          </span>
        </div>
      </div>
      {flags.length ? (
        <ul className="divide-y border-t">
          {flags.map((t) => (
            <FlagRow
              key={`${t.clause_id}-${t.rule_id}`}
              t={t}
              cleared={review.cleared.find((c) => c.clause_id === t.clause_id && c.rule_id === t.rule_id)}
              onJump={onJump}
            />
          ))}
        </ul>
      ) : scored ? (
        <p className="border-t px-4 py-3 text-sm text-muted-foreground sm:px-5">
          No red-flag pattern matched in this contract{review.findings.length ? `; the ${plural(review.findings.length, "finding")} above came from the model alone` : ""}.
        </p>
      ) : null}
    </Card>
  )
}
