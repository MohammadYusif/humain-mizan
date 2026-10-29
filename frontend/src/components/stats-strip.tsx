
import { Skeleton } from "@/components/ui/skeleton"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { ReviewView, TraceEvent } from "@/lib/api"
import { seconds, tokens, usd } from "@/lib/format"

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  const body = (
    <div className="flex min-w-0 flex-col gap-0.5 px-4 py-3" tabIndex={hint ? 0 : undefined}>
      <dt className="flex items-center gap-1.5 text-[0.7rem] font-medium text-muted-foreground">
        {label}
      </dt>
      <dd className="truncate font-mono text-sm font-medium tabular">{value}</dd>
    </div>
  )
  if (!hint) return body
  return (
    <Tooltip>
      <TooltipTrigger asChild>{body}</TooltipTrigger>
      <TooltipContent>{hint}</TooltipContent>
    </Tooltip>
  )
}

/** Run stats from the run_end event; while running, live totals summed from the trace so far. */
export function StatsStrip({ review, trace }: { review: ReviewView | null; trace: TraceEvent[] | null }) {
  if (!review || !trace) {
    return <Skeleton className="h-[4.25rem] w-full rounded-lg" />
  }
  const start = trace.find((e) => e.type === "run_start")
  const calls = trace.filter((e) => e.type === "llm_call")
  const s = review.stats
  const usage = s?.usage ?? {
    input_tokens: calls.reduce((a, e) => a + e.usage.input_tokens, 0),
    output_tokens: calls.reduce((a, e) => a + e.usage.output_tokens, 0),
    cache_read_tokens: calls.reduce((a, e) => a + (e.usage.cache_read_tokens ?? 0), 0),
    cache_write_tokens: calls.reduce((a, e) => a + (e.usage.cache_write_tokens ?? 0), 0),
  }
  const inTotal = usage.input_tokens + (usage.cache_read_tokens ?? 0) + (usage.cache_write_tokens ?? 0)
  const cost = s ? s.cost_usd : calls.reduce((a, e) => a + e.cost_usd, 0)
  const last = trace.at(-1)
  const latency = s ? s.latency_s : (last?.t ?? 0)
  const live = !s

  return (
    <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-3 lg:grid-cols-5 [&>*]:bg-card max-lg:[&>*:last-child]:col-span-2">
      <Stat label="Model" value={start?.type === "run_start" ? start.model : "–"} />
      <Stat label={live ? "Turns so far" : "Turns"} value={String(s?.turns ?? calls.length)} />
      <Stat
        label="Tokens"
        value={`${tokens(inTotal)} / ${tokens(usage.output_tokens)}`}
        hint={`In ${inTotal.toLocaleString("en-US")} (cache read ${(usage.cache_read_tokens ?? 0).toLocaleString("en-US")}, cache write ${(usage.cache_write_tokens ?? 0).toLocaleString("en-US")}) · out ${usage.output_tokens.toLocaleString("en-US")}`}
      />
      <Stat
        label="Cost"
        value={s?.priced === false ? "unpriced" : usd(cost)}
        hint={s?.priced === false ? "This provider/model has no price configured" : undefined}
      />
      <Stat label={live ? "Elapsed" : "Latency"} value={seconds(latency)} />
    </dl>
  )
}
