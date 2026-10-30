import { Building2, Globe, Lock, ShieldCheck } from "lucide-react"
import { cn } from "cn"
import { useId } from "react"

import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import type { DataPolicyConfig, DataPolicyRecord, Sensitivity } from "@/lib/api"
import { destination, LEVEL_LABEL } from "@/lib/data-policy"

const LEVELS: { value: Sensitivity; label: string; icon: typeof Lock; hint: string }[] = [
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

/** Choose a contract's label, with what each one means for this server. */
export function SensitivityPicker({
  value,
  onChange,
  policy,
}: {
  value: Sensitivity
  onChange: (v: Sensitivity) => void
  policy: DataPolicyConfig | null
}) {
  const id = useId()
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-sm font-medium">Who may see it</legend>
      <RadioGroup value={value} onValueChange={(v) => onChange(v as Sensitivity)} className="gap-1.5">
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
      {destination(value, policy) ? (
        <p className="text-xs text-muted-foreground">
          On this server: <span className="text-foreground">{destination(value, policy)}</span>
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
