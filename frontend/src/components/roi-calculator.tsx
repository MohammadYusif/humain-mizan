import { Calculator, ChevronDown } from "lucide-react"
import { cn } from "cn"
import { useId, useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import type { EvalModel } from "@/lib/api"
import { percent } from "@/lib/format"

/** Fixed conversion used for the API cost; shown next to every SAR figure derived from USD. */
const SAR_PER_USD = 3.75

const sar = (v: number) =>
  `SAR ${Math.round(v).toLocaleString("en-US")}`
const hours = (v: number) => `${v.toLocaleString("en-US", { maximumFractionDigits: v < 10 ? 1 : 0 })} h`

interface FieldProps {
  label: string
  hint: string
  value: number
  onChange: (v: number) => void
  min: number
  max: number
  step: number
  unit: string
  tag: "your input" | "assumption"
}

function Field({ label, hint, value, onChange, min, max, step, unit, tag }: FieldProps) {
  const id = useId()
  const set = (v: number) => onChange(Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : min)
  return (
    <div className="flex flex-col gap-2 border-b pb-3 last:border-b-0 last:pb-0">
      <div className="flex flex-wrap items-center gap-2">
        <Label htmlFor={id} className="text-sm font-medium">
          {label}
        </Label>
        <Badge
          variant="outline"
          className={cn("rounded-sm text-[0.7rem] font-normal", tag === "assumption" && "border-dashed text-muted-foreground")}
        >
          {tag}
        </Badge>
      </div>
      <div className="flex items-center gap-3">
        <Slider
          value={[value]}
          min={min}
          max={max}
          step={step}
          onValueChange={([v]) => set(v)}
          aria-label={label}
          className="flex-1"
        />
        <div className="flex items-center gap-1.5">
          <Input
            id={id}
            type="number"
            inputMode="numeric"
            min={min}
            max={max}
            step={step}
            value={value}
            onChange={(e) => set(e.target.valueAsNumber)}
            className="h-8 w-20 bg-background text-end tabular"
          />
          <span className="w-14 text-xs text-muted-foreground">{unit}</span>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  )
}

/**
 * ROI estimate for the configuration the app runs today (the first /evals entry). Measured inputs come
 * from that eval; everything else is a viewer input or an assumption, and labelled as such.
 */
export function RoiCalculator({ model, name, local }: { model: EvalModel; name: string; local: boolean }) {
  const [contracts, setContracts] = useState(200)
  const [manualMin, setManualMin] = useState(60)
  const [rate, setRate] = useState(450)
  const [escMin, setEscMin] = useState(15)

  // Measured on the saved eval run.
  const cases = model.cases.length || model.summary.cases || 1
  const escShare = model.cases.filter((c) => c.got_route === "escalate").length / cases
  const unroutedShare = model.cases.filter((c) => c.got_route === null).length / cases
  const usdPerContract = model.summary.cases ? model.summary.cost_usd / model.summary.cases : 0

  // Estimate.
  const manualTotalMin = contracts * manualMin
  const humanMin = contracts * escShare * escMin + contracts * unroutedShare * manualMin
  const savedH = Math.max(0, manualTotalMin - humanMin) / 60
  const savedSar = savedH * rate
  const apiSar = contracts * usdPerContract * SAR_PER_USD
  const net = savedSar - apiSar
  const minutesToCoverApi = rate > 0 ? (apiSar / rate) * 60 : 0

  return (
    <Card className="gap-5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-heading text-lg font-semibold">
          <Calculator className="size-5 text-primary" aria-hidden />
          Impact estimate
        </CardTitle>
        <CardDescription>
          What {name} would save at your volume. An estimate built on measured eval rates and your own inputs; not a
          measurement of your contracts.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-3">
          <Field
            label="Contracts per month"
            hint="How many contracts your team reviews."
            value={contracts}
            onChange={setContracts}
            min={1}
            max={2000}
            step={10}
            unit="/ month"
            tag="your input"
          />
          <Field
            label="Manual review time"
            hint="A lawyer's time per contract today, start to finish."
            value={manualMin}
            onChange={setManualMin}
            min={5}
            max={480}
            step={5}
            unit="min"
            tag="your input"
          />
          <Field
            label="Lawyer cost"
            hint="Fully loaded cost of one lawyer hour."
            value={rate}
            onChange={setRate}
            min={50}
            max={3000}
            step={25}
            unit="SAR / h"
            tag="your input"
          />
          <Field
            label="Lawyer time per escalation"
            hint="Targeted review of an escalated contract, with the agent's findings and question in hand."
            value={escMin}
            onChange={setEscMin}
            min={1}
            max={240}
            step={1}
            unit="min"
            tag="assumption"
          />
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-sm text-muted-foreground">Estimated lawyer time saved per month</span>
            <span className="font-heading text-4xl leading-none font-semibold text-primary tabular">{sar(savedSar)}</span>
            <span className="text-sm text-muted-foreground tabular">
              {hours(savedH)} of {hours(manualTotalMin / 60)} of manual review
            </span>
          </div>
          <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1.5 border-t pt-3 text-sm">
            <dt className="text-muted-foreground">Agent API cost per month</dt>
            <dd className="text-end tabular">{local ? "none (local model)" : sar(apiSar)}</dd>
            <dt className="text-muted-foreground">Payback</dt>
            <dd className="text-end tabular">
              {apiSar > 0 ? `${Math.max(1, Math.round(minutesToCoverApi))} min of saved lawyer time` : "no API cost"}
            </dd>
          </dl>
          <p className="rounded-lg border border-dashed px-3 py-2 text-sm">
            Net of API cost: <span className="font-semibold text-primary tabular">{sar(net)}</span> per month
            {apiSar > 0 ? (
              <span className="text-muted-foreground tabular">
                {" "}
                · {Math.round(savedSar / apiSar).toLocaleString("en-US")} SAR saved per SAR of API cost
              </span>
            ) : null}
          </p>
          <div className="rounded-lg border bg-background/60 p-3 text-xs leading-relaxed">
            <p className="mb-1.5 font-semibold text-muted-foreground">
              Measured on the eval ({name}, {cases} contracts)
            </p>
            <ul className="flex flex-col gap-1 tabular">
              <li>
                Escalated to a lawyer: <span className="font-medium">{percent(escShare)}</span> of contracts
              </li>
              <li>
                Left without a route (treated as a full manual review):{" "}
                <span className="font-medium">{percent(unroutedShare)}</span>
              </li>
              <li>
                API cost per contract:{" "}
                <span className="font-medium">
                  {local ? "none (local model)" : `$${usdPerContract.toFixed(3)} ≈ SAR ${(usdPerContract * SAR_PER_USD).toFixed(2)}`}
                </span>
              </li>
            </ul>
          </div>
          <Collapsible>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="group w-fit text-muted-foreground">
                How this is calculated
                <ChevronDown className="transition-transform group-data-[state=open]:rotate-180" data-icon="inline-end" aria-hidden />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2 flex flex-col gap-2 rounded-lg border bg-background/60 p-3 text-xs leading-relaxed">
              <p>
                <span className="font-semibold">Lawyer time with the agent</span> = contracts × escalation share × lawyer
                minutes per escalation + contracts × unrouted share × manual minutes.
              </p>
              <p>
                <span className="font-semibold">Hours saved</span> = (contracts × manual minutes − lawyer time with the
                agent) ÷ 60. <span className="font-semibold">SAR saved</span> = hours saved × lawyer cost per hour.
              </p>
              <p>
                <span className="font-semibold">API cost</span> = contracts × measured cost per contract × {SAR_PER_USD}{" "}
                SAR/USD (fixed rate). <span className="font-semibold">Payback</span> = API cost ÷ lawyer cost per hour,
                in minutes of saved lawyer time.
              </p>
              <p className="text-muted-foreground">
                Contracts the agent approves or negotiates are assumed to need no lawyer time; negotiation rounds with the
                counterparty are not counted. The escalation and unrouted shares and the cost per contract come from a
                small synthetic eval, not from your contracts.
              </p>
            </CollapsibleContent>
          </Collapsible>
        </div>
      </CardContent>
    </Card>
  )
}
