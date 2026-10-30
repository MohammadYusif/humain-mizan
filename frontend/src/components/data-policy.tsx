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
import type { ContractSummary, DataPolicyConfig, DataPolicyRecord, Sensitivity } from "@/lib/api"
import { destination, LEVEL_LABEL, looserThan, reasonText } from "@/lib/data-policy"

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
