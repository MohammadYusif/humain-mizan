import { Upload } from "lucide-react"
import { cn } from "cn"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import type { Route } from "@/lib/api"
import { ROUTE_DESCRIPTION, ROUTE_LABEL } from "@/lib/format"
import { ROUTE_TONE } from "@/lib/tones"

const ROUTES: Route[] = ["approve", "negotiate", "escalate"]

/** Start screen: what happens to a contract, and the three possible outcomes. */
export function Intro({ onUpload }: { onUpload: () => void }) {
  return (
    <Card className="gap-0 p-0">
      <div className="flex max-w-2xl flex-col gap-4 p-6 sm:p-8">
        <h1 className="text-3xl leading-tight font-semibold text-balance sm:text-4xl">
          Pick a contract and Mizan reviews it against your playbook, then routes it.
        </h1>
        <p className="text-[0.95rem] leading-relaxed text-muted-foreground">
          It reads every clause in Arabic or English, quotes each issue word for word and drafts the redline. The route
          is decided by code from those findings, not by the model.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Button size="lg" className="h-10 px-4 text-sm" onClick={onUpload}>
            <Upload aria-hidden />
            Upload a contract
          </Button>
          <span className="text-sm text-muted-foreground">or choose a sample from the list on the left.</span>
        </div>
      </div>
      <dl className="grid border-t sm:grid-cols-3 sm:divide-x">
        {ROUTES.map((r) => (
          <div key={r} className="flex flex-col gap-1 border-b px-6 py-4 last:border-b-0 sm:border-b-0 sm:px-8">
            <dt className={cn("text-base font-semibold", ROUTE_TONE[r].text)}>{ROUTE_LABEL[r]}</dt>
            <dd className="text-sm text-muted-foreground">{ROUTE_DESCRIPTION[r]}</dd>
          </div>
        ))}
      </dl>
    </Card>
  )
}
