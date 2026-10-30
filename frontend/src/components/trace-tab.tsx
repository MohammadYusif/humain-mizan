import { CircleAlert, MessageSquare, Flag, FlagTriangleRight, MessageSquareDashed, Wrench } from "lucide-react"
import { cn } from "cn"

import { ARRIVE, useArrivals } from "@/hooks/use-arrivals"
import { useState } from "react"

import { RichText } from "@/components/rich-text"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import type { TraceEvent, Usage } from "@/lib/api"
import { langOf, prettyPayload, seconds, tokens, usd } from "@/lib/format"

function Payload({ label, value, error }: { label: string; value: unknown; error?: boolean }) {
  const text = prettyPayload(value)
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className={cn("text-[0.7rem] font-semibold", error ? "text-escalate" : "text-muted-foreground")}>
        {label}
      </span>
      <pre
        dir="ltr"
        className={cn(
          "max-h-80 overflow-auto rounded-md border bg-muted/60 p-3 font-mono text-[0.75rem] leading-relaxed break-words whitespace-pre-wrap",
          error && "border-escalate/40 bg-escalate-soft"
        )}
      >
        {text || "–"}
      </pre>
    </div>
  )
}

function str(v: unknown): string {
  return typeof v === "string" ? v : ""
}

/** clear_tripwire: the reviewer's on-record justification for a red flag, shown as a document, not JSON. */
function ClearTripwire({ input, output, error }: { input: unknown; output: string; error: boolean }) {
  const i = (input ?? {}) as Record<string, unknown>
  const reason = str(i.reason)
  const quote = str(i.quote)
  return (
    <div className="flex flex-col gap-3">
      <dl className="grid gap-x-4 gap-y-1.5 text-sm sm:grid-cols-[7rem_minmax(0,1fr)]">
        <dt className="text-muted-foreground">Red flag</dt>
        <dd className="font-mono text-[0.8rem]">
          {str(i.rule_id)} on {str(i.clause_id)}
        </dd>
        <dt className="text-muted-foreground">Reason</dt>
        <dd dir="auto" lang={langOf(reason)}>
          {reason || "–"}
        </dd>
        <dt className="text-muted-foreground">Evidence</dt>
        <dd>
          <blockquote dir="auto" lang={langOf(quote)} className="font-heading text-[0.95rem] text-foreground">
            {quote || "–"}
          </blockquote>
        </dd>
      </dl>
      <Payload label={error ? "Rejected" : "Result"} value={output} error={error} />
    </div>
  )
}

function UsageGrid({ usage }: { usage: Usage }) {
  const rows: [string, number | undefined][] = [
    ["Input", usage.input_tokens],
    ["Output", usage.output_tokens],
    ["Cache read", usage.cache_read_tokens],
    ["Cache write", usage.cache_write_tokens],
  ]
  return (
    <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {rows.map(([k, v]) => (
        <div key={k} className="rounded-md border bg-background/60 px-2.5 py-1.5">
          <dt className="text-[0.7rem] text-muted-foreground">{k}</dt>
          <dd className="font-mono text-sm tabular">{tokens(v ?? 0)}</dd>
        </div>
      ))}
    </dl>
  )
}

function eventMeta(e: TraceEvent) {
  switch (e.type) {
    case "run_start":
      return { icon: Flag, title: "Run started", tone: "text-primary" }
    case "llm_call":
      return { icon: MessageSquare, title: `Turn ${e.turn} · model call`, tone: "text-primary" }
    case "tool_call":
      return { icon: Wrench, title: e.name, tone: e.is_error ? "text-escalate" : "text-brass-ink" }
    case "run_end":
      return { icon: FlagTriangleRight, title: "Run finished", tone: "text-approve" }
    case "nudge":
      return { icon: MessageSquareDashed, title: `Completion check · nudge ${e.n}`, tone: "text-muted-foreground" }
    default:
      return { icon: CircleAlert, title: "Error", tone: "text-escalate" }
  }
}

function Summary({ e }: { e: TraceEvent }) {
  const chip = "rounded-md font-mono text-[0.7rem] font-normal"
  switch (e.type) {
    case "run_start":
      return (
        <Badge variant="outline" className={chip}>
          {e.model}
        </Badge>
      )
    case "llm_call":
      return (
        <>
          <Badge variant="secondary" className={chip}>
            {e.stop_reason}
          </Badge>
          <span className="tabular">
            {tokens(e.usage.input_tokens + (e.usage.cache_read_tokens ?? 0) + (e.usage.cache_write_tokens ?? 0))} in ·{" "}
            {tokens(e.usage.output_tokens)} out
          </span>
          <span className="tabular">{usd(e.cost_usd)}</span>
          <span className="tabular">{seconds(e.latency_s)}</span>
        </>
      )
    case "tool_call":
      return (
        <>
          {e.name === "clear_tripwire" ? (
            <Badge variant="outline" className="rounded-md border-dashed font-mono text-[0.7rem] font-normal">
              {str((e.input as Record<string, unknown> | null)?.rule_id)} @ {str((e.input as Record<string, unknown> | null)?.clause_id)}
            </Badge>
          ) : null}
          {e.is_error ? (
            <Badge variant="outline" className="rounded-md border-escalate/40 bg-escalate-soft text-escalate">
              Tool error
            </Badge>
          ) : (
            <Badge variant="outline" className={chip}>
              ok
            </Badge>
          )}
          <span className="tabular">{seconds(e.duration_s)}</span>
        </>
      )
    case "nudge":
      return (
        <span dir="auto" className="max-w-[40ch] truncate">
          {e.text}
        </span>
      )
    case "run_end":
      return (
        <>
          <Badge variant="secondary" className={chip}>
            {e.stop_reason}
          </Badge>
          <span className="tabular">{e.turns} turns</span>
          <span className="tabular">{usd(e.cost_usd)}</span>
        </>
      )
    default:
      return null
  }
}

function Detail({ e }: { e: TraceEvent }) {
  switch (e.type) {
    case "run_start":
      return (
        <dl className="grid gap-2 text-sm sm:grid-cols-[8rem_minmax(0,1fr)]">
          <dt className="text-muted-foreground">Task</dt>
          <dd dir="auto">{e.task}</dd>
          <dt className="text-muted-foreground">Provider</dt>
          <dd className="font-mono text-[0.8rem]">{e.provider ?? "–"}</dd>
          <dt className="text-muted-foreground">Model</dt>
          <dd className="font-mono text-[0.8rem]">{e.model}</dd>
        </dl>
      )
    case "llm_call":
      return (
        <div className="flex flex-col gap-3">
          {e.text ? <RichText text={e.text} className="rounded-md border bg-background/60 p-3 text-sm leading-relaxed" /> : null}
          {e.tool_calls.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-muted-foreground">Requested</span>
              {e.tool_calls.map((tc) => (
                <Badge key={tc.id} variant="outline" className="rounded-md font-mono text-[0.7rem] font-normal">
                  {tc.name}
                </Badge>
              ))}
            </div>
          ) : null}
          <UsageGrid usage={e.usage} />
          {e.request_id ? <p className="font-mono text-[0.7rem] break-all text-muted-foreground">{e.request_id}</p> : null}
        </div>
      )
    case "tool_call":
      if (e.name === "clear_tripwire") return <ClearTripwire input={e.input} output={e.output} error={e.is_error} />
      return (
        <div className="grid gap-3 lg:grid-cols-2">
          <Payload label="Input" value={e.input} />
          <Payload label={e.is_error ? "Error output" : "Output"} value={e.output} error={e.is_error} />
        </div>
      )
    case "nudge":
      return (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-muted-foreground">
            The model tried to stop with steps left, so the agent loop sent it this reminder (at most 2 per run).
          </p>
          <RichText text={e.text} className="rounded-md border border-dashed bg-background/60 p-3 text-sm leading-relaxed" />
        </div>
      )
    case "run_end":
      return (
        <div className="flex flex-col gap-3">
          <UsageGrid usage={e.usage} />
          <p className="text-sm text-muted-foreground tabular">
            {e.turns} turns · {seconds(e.latency_s)} · {usd(e.cost_usd)}
            {e.priced === false ? " · model not priced" : ""}
          </p>
        </div>
      )
    default:
      return <Payload label="Event" value={e} error />
  }
}

export function TraceTab({ trace, running }: { trace: TraceEvent[] | null; running: boolean }) {
  const [open, setOpen] = useState<string[]>([])
  const isNew = useArrivals(trace?.map((_, i) => String(i)))

  if (!trace) {
    return (
      <div className="flex flex-col gap-2">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-12 w-full rounded-lg" />
        ))}
      </div>
    )
  }
  if (trace.length === 0) {
    return (
      <Empty className="border bg-card">
        <EmptyHeader>
          <EmptyTitle>No events yet</EmptyTitle>
          <EmptyDescription>Events appear as the agent works.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  const toolCalls = trace.filter((e) => e.type === "tool_call")
  const toolErrors = toolCalls.filter((e) => e.type === "tool_call" && e.is_error).length
  const all = trace.map((_, i) => String(i))

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
        <span className="tabular">{trace.length} events</span>
        <span className="tabular">{trace.filter((e) => e.type === "llm_call").length} model calls</span>
        <span className="tabular">{toolCalls.length} tool calls</span>
        {toolErrors > 0 ? (
          <Badge variant="outline" className="rounded-md border-escalate/40 bg-escalate-soft text-escalate tabular">
            {toolErrors} tool error{toolErrors === 1 ? "" : "s"}
          </Badge>
        ) : null}
        <span className="ms-auto flex gap-1">
          <Button variant="ghost" size="sm" onClick={() => setOpen(all)}>
            Expand all
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setOpen([])}>
            Collapse
          </Button>
        </span>
      </div>

      <Accordion
        type="multiple"
        value={open}
        onValueChange={setOpen}
        className="relative gap-2 before:absolute before:inset-y-3 before:start-[1.0625rem] before:w-px before:bg-border"
      >
        {trace.map((e, i) => {
          const m = eventMeta(e)
          const Icon = m.icon
          const err = (e.type === "tool_call" && e.is_error) || e.type === "error"
          const nudge = e.type === "nudge"
          return (
            <AccordionItem
              key={i}
              value={String(i)}
              className={cn(
                "relative rounded-lg border bg-card not-last:border-b",
                isNew(String(i)) && ARRIVE,
                err && "border-escalate/50 bg-escalate-soft/40",
                nudge && "border-dashed bg-muted/40"
              )}
            >
              <AccordionTrigger className="items-center gap-3 px-2.5 py-2 hover:no-underline sm:px-3">
                <span
                  className={cn(
                    "relative z-10 grid size-6 shrink-0 place-items-center rounded-full border bg-background",
                    m.tone,
                    err && "border-escalate/50"
                  )}
                >
                  <Icon className="size-3.5" aria-hidden />
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className={cn("truncate", e.type === "tool_call" ? "font-mono text-[0.8rem]" : "font-medium")}>
                      {m.title}
                    </span>
                  </span>
                  <span className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs font-normal text-muted-foreground">
                    <Summary e={e} />
                  </span>
                </span>
                <span className="hidden shrink-0 font-mono text-[0.7rem] font-normal text-muted-foreground tabular sm:inline">
                  +{e.t.toFixed(2)}s
                </span>
              </AccordionTrigger>
              <AccordionContent className="h-auto px-3 pb-3 sm:ps-12">
                <Detail e={e} />
              </AccordionContent>
            </AccordionItem>
          )
        })}
        {running ? (
          <div className="relative flex items-center gap-3 rounded-lg border border-dashed px-2.5 py-2.5 text-sm text-muted-foreground sm:px-3">
            <span className="relative z-10 grid size-6 place-items-center rounded-full border bg-background">
              <span className="size-2 rounded-full bg-brass" />
            </span>
            Live · waiting for the next event…
          </div>
        ) : null}
      </Accordion>
    </div>
  )
}
