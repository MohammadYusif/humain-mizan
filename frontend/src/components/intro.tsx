import { BookOpenCheck, Quote, Route as RouteIcon, Upload } from "lucide-react"
import { cn } from "cn"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import type { Route } from "@/lib/api"
import { ROUTE_DESCRIPTION, ROUTE_LABEL } from "@/lib/format"
import { ROUTE_ICON, ROUTE_TONE } from "@/lib/tones"

const STEPS = [
  { icon: BookOpenCheck, title: "Reads every clause", body: "Arabic, English or both, against the legal team’s playbook." },
  { icon: Quote, title: "Records findings", body: "Each one quotes the clause verbatim and proposes a redline." },
  { icon: RouteIcon, title: "Code routes it", body: "A deterministic score, not the model, decides the route." },
]

export function Intro({ onUpload }: { onUpload: () => void }) {
  return (
    <div className="flex flex-col gap-6">
      <Card className="gap-6 p-6 sm:p-8">
        <div className="flex max-w-2xl flex-col gap-3">
          <span className="text-xs font-medium tracking-[0.14em] text-brass-ink uppercase">Contract review, end to end</span>
          <h1 className="text-3xl leading-tight font-semibold text-balance sm:text-4xl">
            Choose a contract and let the agent take it from first read to a routed decision.
          </h1>
          <p className="text-[0.95rem] leading-relaxed text-muted-foreground">
            Start a review from the panel, or open a finished run from History to inspect its findings, the annotated
            contract and the full trace of model and tool calls.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <Button size="lg" className="h-10 px-4 text-sm" onClick={onUpload}>
              <Upload aria-hidden />
              Try your own contract
            </Button>
            <span className="text-sm text-muted-foreground">PDF, Word or pasted text, in Arabic or English</span>
          </div>
        </div>
        <ol className="grid gap-3 sm:grid-cols-3">
          {STEPS.map((s, i) => (
            <li key={s.title} className="flex gap-3 rounded-lg border bg-background/60 p-4">
              <span className="font-heading text-2xl leading-none font-semibold text-brass-ink tabular">{i + 1}</span>
              <div className="flex flex-col gap-1">
                <span className="flex items-center gap-1.5 text-sm font-semibold">
                  <s.icon className="size-4 text-primary" aria-hidden />
                  {s.title}
                </span>
                <span className="text-sm text-muted-foreground">{s.body}</span>
              </div>
            </li>
          ))}
        </ol>
      </Card>
      <div className="grid gap-3 md:grid-cols-3">
        {(["approve", "negotiate", "escalate"] as Route[]).map((r) => {
          const Icon = ROUTE_ICON[r]
          return (
            <div key={r} className={cn("flex flex-col gap-2 rounded-xl border p-4", ROUTE_TONE[r].soft, ROUTE_TONE[r].border)}>
              <span className={cn("flex items-center gap-2 font-heading text-xl font-semibold", ROUTE_TONE[r].text)}>
                <Icon className="size-5" strokeWidth={1.75} aria-hidden />
                {ROUTE_LABEL[r]}
              </span>
              <span className="text-sm text-foreground/80">{ROUTE_DESCRIPTION[r]}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
