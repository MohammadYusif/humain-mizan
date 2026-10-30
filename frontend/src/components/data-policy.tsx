import { Building2, Globe, Lock, ScanSearch, ShieldCheck } from "lucide-react"
import { cn } from "cn"
import { useId } from "react"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import type { ContractSummary, DataPolicyConfig, DataPolicyRecord, LabelEvidence, Sensitivity } from "@/lib/api"
import { blocked, destination, LEVEL_LABEL, looserThan, reasonText } from "@/lib/data-policy"

const ORDER: Sensitivity[] = ["public", "internal", "restricted"]
const LEVEL_ICON: Record<Sensitivity, typeof Lock> = { public: Globe, internal: Building2, restricted: Lock }
/** Text, fill and tint classes per level: public green, internal brass, restricted red. */
const LEVEL_TONE: Record<Sensitivity, { text: string; fill: string; soft: string; border: string }> = {
  public: { text: "text-approve", fill: "bg-approve", soft: "bg-approve-soft", border: "border-approve/30" },
  internal: { text: "text-brass-ink", fill: "bg-brass", soft: "bg-brass-soft", border: "border-brass/40" },
  restricted: { text: "text-escalate", fill: "bg-escalate", soft: "bg-escalate-soft", border: "border-escalate/30" },
}

/** Public, Internal, Restricted on one rail; the rail fills up to the level, like a gauge. */
function LevelMeter({ level, compact }: { level: Sensitivity; compact?: boolean }) {
  const at = ORDER.indexOf(level)
  return (
    <div className="grid grid-cols-3 gap-1.5" role="img" aria-label={`Label: ${LEVEL_LABEL[level]}`}>
      {ORDER.map((l, i) => {
        const Icon = LEVEL_ICON[l]
        const on = i <= at
        return (
          <div key={l} className="flex flex-col gap-1.5">
            <div className={cn("h-1.5 rounded-full", on ? LEVEL_TONE[level].fill : "bg-muted")} />
            <span
              className={cn(
                "flex items-center gap-1",
                compact ? "text-[0.7rem]" : "text-xs",
                i === at ? cn("font-semibold", LEVEL_TONE[level].text) : "text-muted-foreground"
              )}
            >
              <Icon className="size-3.5 shrink-0" aria-hidden />
              {LEVEL_LABEL[l]}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function pluralKind(kind: string) {
  if (kind.endsWith("ss")) return `${kind}es`
  return kind.endsWith("s") ? kind : `${kind}s`
}

/** What the detector found, grouped by kind: "Party name: Wadi Freight Co., Ramla Retail Co." */
function Evidence({ items, limit, compact }: { items: LabelEvidence[]; limit?: number; compact?: boolean }) {
  const groups = new Map<string, LabelEvidence[]>()
  for (const e of items) groups.set(e.kind, [...(groups.get(e.kind) ?? []), e])
  // What set the level first (restricted findings), then the identifiers.
  const sorted = [...groups.entries()].sort(
    ([, a], [, b]) => ORDER.indexOf(b[0].level) - ORDER.indexOf(a[0].level)
  )
  const rows: { kind: string; list: LabelEvidence[]; more: number }[] = []
  for (const [kind, list] of sorted) {
    const used = rows.reduce((n, r) => n + r.list.length, 0)
    if (limit !== undefined && used >= limit) break
    const take = limit === undefined ? list : list.slice(0, Math.max(1, limit - used))
    rows.push({ kind, list: take, more: list.length - take.length })
  }
  const hidden = items.length - rows.reduce((n, r) => n + r.list.length + r.more, 0)
  return (
    <ul className="flex flex-col gap-1.5">
      {rows.map(({ kind, list, more }) => (
        <li key={kind} className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xs">
          <span className={cn("shrink-0 text-muted-foreground", compact ? "basis-full text-[0.7rem]" : "w-28")}>
            {list.length > 1 ? pluralKind(kind) : kind}
          </span>
          {list.map((e) => (
            <span
              key={e.text}
              dir="auto"
              className={cn(
                "min-w-0 rounded-md border px-1.5 py-0.5 font-medium [overflow-wrap:anywhere]",
                LEVEL_TONE[e.level].soft,
                LEVEL_TONE[e.level].border
              )}
            >
              {e.text}
            </span>
          ))}
          {more > 0 ? <span className="text-muted-foreground">+{more}</span> : null}
        </li>
      ))}
      {hidden > 0 ? <li className="text-xs text-muted-foreground">and {hidden} more</li> : null}
    </ul>
  )
}

/**
 * The label Mizan suggested from the contract's own text, shown the way people check it: where it
 * sits on the scale, exactly what in the text put it there, and what that means for the contract.
 */
export function LabelSuggestion({
  c,
  policy,
  onRestore,
  busy,
  compact,
  bare,
}: {
  c: Pick<ContractSummary, "sensitivity" | "label_set_by" | "label_detected" | "label_reasons" | "label_evidence">
  policy: DataPolicyConfig | null
  onRestore?: (level: Sensitivity) => void
  busy?: boolean
  compact?: boolean
  /** Inside another box: no border or padding of its own. */
  bare?: boolean
}) {
  const level = c.sensitivity
  if (!level) return null
  const evidence = c.label_evidence ?? []
  const auto = c.label_set_by === "auto"
  const where = destination(level, policy)
  return (
    <div
      className={cn(
        "flex flex-col",
        compact ? "gap-2.5" : "gap-3.5",
        bare ? "pt-1" : cn("rounded-lg border bg-card", compact ? "p-3" : "p-4")
      )}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className={cn("font-semibold", compact ? "text-sm" : "text-base")}>
          {auto ? "Mizan suggests " : "Label "}
          <span className={LEVEL_TONE[level].text}>{LEVEL_LABEL[level]}</span>
        </span>
        {!compact ? (
          <span className="text-[0.7rem] text-muted-foreground">
            {auto ? "Read on this server, before any model" : c.label_set_by === "person" ? "Set by a person" : "Sample label"}
          </span>
        ) : null}
      </div>
      <LevelMeter level={level} compact={compact} />
      {evidence.length ? (
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium">Found in the text</span>
          <Evidence items={evidence} limit={compact ? 5 : undefined} compact={compact} />
        </div>
      ) : c.label_reasons?.length ? (
        <p className="text-xs text-muted-foreground">{c.label_reasons.join("; ")}.</p>
      ) : null}
      {c.label_set_by === "person" && c.label_detected && c.label_detected !== level ? (
        <LabelBasis c={c} onRestore={onRestore} busy={busy} />
      ) : null}
      {where ? (
        <p className={cn("text-xs", blocked(level, policy) ? "font-medium text-escalate" : "text-muted-foreground")}>
          {where}
        </p>
      ) : null}
      {!compact ? (
        <p className="text-xs text-muted-foreground">
          Making it stricter is one click. Making it looser is recorded as a person’s decision.
        </p>
      ) : null}
    </div>
  )
}

/** A label choice on upload: one of the levels, or let the server read the text and pick. */
export type LabelChoice = Sensitivity | "auto"

const LEVELS: { value: LabelChoice; label: string; icon: typeof Lock; hint: string }[] = [
  {
    value: "auto",
    label: "Detect from the text",
    icon: ScanSearch,
    hint: "Mizan reads it on this server before any model sees it and suggests the label. Marked confidential, under an NDA or with health data: Restricted. Names or account details: Internal. A blank template: Public.",
  },
  { value: "public", label: "Public", icon: Globe, hint: "Published or synthetic text. Sent to the model as written." },
  {
    value: "internal",
    label: "Internal",
    icon: Building2,
    hint: "Company business. Names, contact details, account and ID numbers are hidden from an external model.",
  },
  {
    value: "restricted",
    label: "Restricted",
    icon: Lock,
    hint: "Under NDA or otherwise confidential. Never sent to an external model; a lawyer signs off every outcome.",
  },
]

export function SensitivityBadge({ level, className }: { level: Sensitivity; className?: string }) {
  const Icon = level === "restricted" ? Lock : level === "internal" ? Building2 : Globe
  return (
    <Badge
      variant="outline"
      className={cn(
        "h-4.5 gap-1 rounded px-1.5 text-[0.7rem] font-medium",
        level === "restricted" ? "border-escalate/40 text-escalate" : "text-muted-foreground",
        className
      )}
    >
      <Icon data-icon="inline-start" aria-hidden />
      {LEVEL_LABEL[level]}
    </Badge>
  )
}

/** How a contract's label was set, and why. When a person set it looser than the text calls for,
 * says so plainly and offers the detected label back. */
export function LabelBasis({
  c,
  onRestore,
  busy,
  className,
}: {
  c: Pick<ContractSummary, "sensitivity" | "label_set_by" | "label_detected" | "label_reasons">
  onRestore?: (level: Sensitivity) => void
  busy?: boolean
  className?: string
}) {
  const why = reasonText(c.label_reasons)
  const detected = c.label_detected
  if (c.label_set_by === "auto") {
    return (
      <p className={cn("text-xs text-muted-foreground", className)}>
        <span className="font-medium text-foreground">Suggested{why ? ":" : ""}</span> {why}
        {why ? "." : "from the text."}
      </p>
    )
  }
  if (c.label_set_by !== "person" || !c.sensitivity) return null
  if (!detected || detected === c.sensitivity) {
    return <p className={cn("text-xs text-muted-foreground", className)}>Set by a person{detected ? ", as the text suggests" : ""}.</p>
  }
  const looser = looserThan(c.sensitivity, detected)
  return (
    <div className={cn("flex flex-col items-start gap-1.5", className)}>
      <p className={cn("text-xs", looser ? "font-medium text-escalate" : "text-muted-foreground")}>
        Detected: {LEVEL_LABEL[detected]}
        {why ? ` (${why})` : ""}. Set to {LEVEL_LABEL[c.sensitivity]} by a person
        {looser ? ", looser than the text calls for." : "."}
      </p>
      {looser && onRestore ? (
        <Button type="button" variant="outline" size="xs" disabled={busy} onClick={() => onRestore(detected)}>
          Use {LEVEL_LABEL[detected]}
        </Button>
      ) : null}
    </div>
  )
}

/** Before a person sets a label looser than the text calls for: say what changes, then let them decide. */
export function LoosenConfirm({
  pending,
  detected,
  reasons,
  policy,
  onConfirm,
  onCancel,
}: {
  pending: Sensitivity | null
  detected: Sensitivity | null | undefined
  reasons?: string[]
  policy: DataPolicyConfig | null
  onConfirm: () => void
  onCancel: () => void
}) {
  const why = reasonText(reasons)
  return (
    <AlertDialog open={pending !== null} onOpenChange={(o) => (o ? null : onCancel())}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Set to {pending ? LEVEL_LABEL[pending] : ""} instead of {detected ? LEVEL_LABEL[detected] : ""}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            The text reads as {detected ? LEVEL_LABEL[detected] : ""}
            {why ? ` (${why})` : ""}. {pending ? destination(pending, policy) : null} This is recorded as your decision.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>Keep {detected ? LEVEL_LABEL[detected] : ""}</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>Set to {pending ? LEVEL_LABEL[pending] : ""}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

/** Choose a contract's label, with what each one means for this server. */
export function SensitivityPicker({
  value,
  onChange,
  policy,
}: {
  value: LabelChoice
  onChange: (v: LabelChoice) => void
  policy: DataPolicyConfig | null
}) {
  const id = useId()
  const where = value === "auto" ? "Picked when you add the contract, before it can reach any model." : destination(value, policy)
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-sm font-medium">Who may see it</legend>
      <RadioGroup value={value} onValueChange={(v) => onChange(v as LabelChoice)} className="gap-1.5">
        {LEVELS.map((l) => (
          <Label
            key={l.value}
            htmlFor={`${id}-${l.value}`}
            className={cn(
              "flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 font-normal transition-colors",
              value === l.value ? "border-primary/50 bg-primary/5" : "bg-background hover:bg-muted/60"
            )}
          >
            <RadioGroupItem id={`${id}-${l.value}`} value={l.value} className="mt-0.5" />
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="flex items-center gap-1.5 text-sm font-semibold">
                <l.icon className="size-3.5 text-muted-foreground" aria-hidden />
                {l.label}
              </span>
              <span className="text-xs leading-relaxed text-muted-foreground">{l.hint}</span>
            </span>
          </Label>
        ))}
      </RadioGroup>
      {where ? (
        <p className="text-xs text-muted-foreground">
          On this server: <span className="text-foreground">{where}</span>
        </p>
      ) : null}
    </fieldset>
  )
}

/** The audit line on a review: the label, where the model ran, and what it did not see. */
export function DataLine({ policy }: { policy: DataPolicyRecord }) {
  const n = policy.redacted ? Object.values(policy.redacted).reduce((a, b) => a + b, 0) : 0
  let text: string
  if (!policy.allowed) text = "Not sent to any model. A lawyer reviews it."
  else if (policy.location === "local") text = "Reviewed by a model inside your network."
  else text = `Reviewed by an external model${policy.model ? ` (${policy.model})` : ""}.`
  if (policy.allowed && n > 0)
    text += ` ${n} ${n === 1 ? "identifier was" : "identifiers were"} replaced by placeholders before sending.`
  if (policy.allowed && policy.sensitivity === "restricted") text += " A lawyer signs off every outcome."
  const why = reasonText(policy.label_reasons)
  if (policy.label_set_by === "auto") text += ` Label suggested from the text${why ? ` (${why})` : ""}.`
  else if (policy.label_set_by === "person" && policy.label_detected && policy.label_detected !== policy.sensitivity)
    text += ` Detected: ${LEVEL_LABEL[policy.label_detected]}${why ? ` (${why})` : ""}. Set to ${LEVEL_LABEL[policy.sensitivity]} by a person.`
  return (
    <p className="flex items-start gap-2 text-xs text-muted-foreground">
      <ShieldCheck className="mt-px size-3.5 shrink-0" aria-hidden />
      <span>
        <SensitivityBadge level={policy.sensitivity} className="me-1.5 align-[1px]" />
        {text}
      </span>
    </p>
  )
}
