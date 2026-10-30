import { ArrowDown, ArrowUp, Building2, Globe, Lock, ShieldCheck } from "lucide-react"
import { cn } from "cn"
import { useEffect, useId, useState } from "react"

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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { api, type ContractSummary, type DataPolicyConfig, type DataPolicyRecord, type LabelEvidence, type LabelSignOff, type LoweringGround, type Sensitivity } from "@/lib/api"
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
  onChange,
}: {
  c: SignedLabel & Pick<ContractSummary, "label_evidence" | "label_lowering">
  policy: DataPolicyConfig | null
  onRestore?: (level: Sensitivity) => void
  busy?: boolean
  compact?: boolean
  /** Inside another box: no border or padding of its own. */
  bare?: boolean
  /** Lets a person change the label from the card: stricter at once, looser after a sign-off. */
  onChange?: (level: Sensitivity, signOff?: LabelSignOff) => void
}) {
  const [pending, setPending] = useState<Sensitivity | null>(null)
  const level = c.sensitivity
  if (!level) return null
  const change = (to: Sensitivity) => {
    if (looserThan(to, c.label_detected ?? level)) setPending(to)
    else onChange?.(to)
  }
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
      {c.label_set_by === "person" ? (
        <LabelBasis c={c} onRestore={onRestore} busy={busy} />
      ) : null}
      {where ? (
        <p className={cn("text-xs", blocked(level, policy) ? "font-medium text-escalate" : "text-muted-foreground")}>
          {where}
        </p>
      ) : null}
      {onChange ? (
        <div className="flex flex-col gap-1.5 border-t pt-2.5">
          <div className="flex flex-wrap gap-1.5">
            {ORDER.filter((l) => l !== level).map((l) => {
              const up = ORDER.indexOf(l) > ORDER.indexOf(level)
              const Icon = up ? ArrowUp : ArrowDown
              return (
                <Button key={l} type="button" variant="outline" size="xs" disabled={busy} onClick={() => change(l)}>
                  <Icon data-icon="inline-start" aria-hidden />
                  {up ? "Raise" : "Lower"} to {LEVEL_LABEL[l]}
                </Button>
              )
            })}
          </div>
          <p className="text-xs text-muted-foreground">
            Raising is one click. Lowering below what the text calls for needs an answer for each thing found, signed with your account.
          </p>
          <LoosenConfirm
            pending={pending}
            detected={c.label_detected ?? level}
            reasons={c.label_reasons}
            asks={pending ? (c.label_lowering?.[pending] ?? []) : []}
            policy={policy}
            onCancel={() => setPending(null)}
            onConfirm={(signOff) => {
              if (pending) onChange(pending, signOff)
              setPending(null)
            }}
          />
        </div>
      ) : !compact ? (
        <p className="text-xs text-muted-foreground">
          Making it stricter is one click. Making it looser is recorded as a person’s decision.
        </p>
      ) : null}
    </div>
  )
}

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

type SignedLabel = Pick<
  ContractSummary,
  "sensitivity" | "label_set_by" | "label_detected" | "label_reasons" | "label_set_by_name" | "label_set_at" | "label_change_reason"
>

function day(iso: string | null | undefined) {
  if (!iso) return ""
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
}

/** "Set to Internal by Sara Ahmed on 30 Oct 2026" (no trailing full stop). */
function signedText(c: Partial<SignedLabel>) {
  const when = day(c.label_set_at)
  return `Set to ${c.sensitivity ? LEVEL_LABEL[c.sensitivity] : ""} by ${c.label_set_by_name || "a person"}${when ? ` on ${when}` : ""}`
}

/** How a contract's label was set, and why. When a person set it looser than the text calls for,
 * says so plainly, shows who signed it off and their reason, and offers the detected label back. */
export function LabelBasis({
  c,
  onRestore,
  busy,
  className,
}: {
  c: SignedLabel
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
    return (
      <p className={cn("text-xs text-muted-foreground", className)}>
        {signedText(c)}
        {detected ? ", as the text suggests." : "."}
      </p>
    )
  }
  const looser = looserThan(c.sensitivity, detected)
  return (
    <div className={cn("flex flex-col items-start gap-1.5", className)}>
      <p className={cn("text-xs", looser ? "font-medium text-escalate" : "text-muted-foreground")}>
        Detected: {LEVEL_LABEL[detected]}
        {why ? ` (${why})` : ""}. {signedText(c)}
        {looser ? ", looser than the text calls for." : "."}
      </p>
      {c.label_change_reason ? (
        <p className="text-xs text-foreground">
          <span className="text-muted-foreground">Reason given:</span> {c.label_change_reason}
        </p>
      ) : null}
      {looser && onRestore ? (
        <Button type="button" variant="outline" size="xs" disabled={busy} onClick={() => onRestore(detected)}>
          Use {LEVEL_LABEL[detected]}
        </Button>
      ) : null}
    </div>
  )
}

/** Before a person sets a label looser than the text calls for: say what changes, then ask, for
 * each thing that raised the label, why it no longer applies. Fixed choices only, checked by the
 * server: nothing typed, so nothing mistyped or made up. */
export function LoosenConfirm({
  pending,
  detected,
  reasons,
  asks,
  policy,
  onConfirm,
  onCancel,
}: {
  pending: Sensitivity | null
  detected: Sensitivity | null | undefined
  reasons?: string[]
  /** The findings to answer for `pending`, from the server. */
  asks: LoweringGround[]
  policy: DataPolicyConfig | null
  onConfirm: (signOff: LabelSignOff) => void
  onCancel: () => void
}) {
  const id = useId()
  const why = reasonText(reasons)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  // Who signs off comes from the account: undefined while checking, null when not signed in.
  const [signedIn, setSignedIn] = useState<string | null | undefined>(undefined)
  const [authOn, setAuthOn] = useState(true)
  const open = pending !== null
  const close = () => {
    setAnswers({})
    onCancel()
  }
  useEffect(() => {
    if (!open) return
    api.me().then(
      (m) => {
        setSignedIn(m.user ?? null)
        setAuthOn(m.auth)
      },
      () => setSignedIn(null)
    )
  }, [open])
  const answered = asks.filter((g) => answers[g.id]).length
  const ready = asks.length > 0 && answered === asks.length && Boolean(signedIn)
  return (
    <AlertDialog open={open} onOpenChange={(o) => (o ? null : close())}>
      <AlertDialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>
            Set to {pending ? LEVEL_LABEL[pending] : ""} instead of {detected ? LEVEL_LABEL[detected] : ""}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            The text reads as {detected ? LEVEL_LABEL[detected] : ""}
            {why ? ` (${why})` : ""}. {pending ? destination(pending, policy) : null} For each thing Mizan found, pick
            why it no longer applies. Your answers and your account go on the record.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex flex-col gap-4">
          {asks.map((g, n) => (
            <fieldset key={g.id} className="flex flex-col gap-2 rounded-md border p-3">
              <legend className="px-1 text-sm font-medium">
                {n + 1}. {g.title}
              </legend>
              {g.found.length ? (
                <p className="flex flex-wrap gap-1">
                  {g.found.map((f) => (
                    <span
                      key={f}
                      dir="auto"
                      className="rounded bg-highlight px-1.5 py-0.5 font-mono text-[0.7rem] text-foreground"
                    >
                      {f}
                    </span>
                  ))}
                </p>
              ) : null}
              <RadioGroup
                value={answers[g.id] ?? ""}
                onValueChange={(v) => setAnswers((a) => ({ ...a, [g.id]: v }))}
                className="gap-1.5"
                aria-label={g.title}
              >
                {g.choices.map((ch) => (
                  <label
                    key={ch.id}
                    htmlFor={`${id}-${ch.id}`}
                    className="flex cursor-pointer items-start gap-2 rounded px-1 py-1 text-sm hover:bg-muted/60"
                  >
                    <RadioGroupItem id={`${id}-${ch.id}`} value={ch.id} className="mt-0.5" />
                    <span>{ch.text}</span>
                  </label>
                ))}
              </RadioGroup>
            </fieldset>
          ))}
          {asks.length === 0 ? (
            <p className="text-xs text-muted-foreground">Checking what needs an answer.</p>
          ) : null}
          {signedIn ? (
            <p className="text-xs text-muted-foreground">
              Signed off as <span className="font-medium text-foreground">{signedIn}</span>, the account you are signed in with.
            </p>
          ) : signedIn === null ? (
            <p className="text-xs font-medium text-escalate">
              {authOn
                ? "Sign in to sign this off: the record shows the account that lowered the label."
                : "Sign-in is off on this server, so nobody can lower a label. An administrator turns it on."}
            </p>
          ) : null}
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={close}>Keep {detected ? LEVEL_LABEL[detected] : ""}</AlertDialogCancel>
          <AlertDialogAction
            disabled={!ready}
            onClick={() => {
              onConfirm({ grounds: answers })
              setAnswers({})
            }}
          >
            {asks.length > 1 && answered < asks.length
              ? `Answer all ${asks.length} (${answered} done)`
              : `Sign off: set to ${pending ? LEVEL_LABEL[pending] : ""}`}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
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
  else if (policy.label_set_by === "person") {
    const reason = policy.label_change_reason ? `, reason: ${policy.label_change_reason}` : ""
    if (policy.label_detected && policy.label_detected !== policy.sensitivity)
      text += ` Detected: ${LEVEL_LABEL[policy.label_detected]}${why ? ` (${why})` : ""}. ${signedText(policy)}${reason}.`
    else if (policy.label_set_by_name) text += ` ${signedText(policy)}${reason}.`
  }
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
