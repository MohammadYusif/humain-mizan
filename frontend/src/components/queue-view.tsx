import {
  ArrowUpRight,
  CircleX,
  Clock,
  Hourglass,
  LoaderCircle,
  Play,
  Send,
  UserRound,
} from "lucide-react"
import { cn } from "cn"
import { useId, useState } from "react"
import { toast } from "sonner"

import { LangChips } from "@/components/new-review-panel"
import { RouteBadge } from "@/components/tone-badges"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useBatch, useBatches } from "@/hooks/use-api"
import { api, errorMessage, type BatchItem, type BatchStatus, type ContractSummary, type Route } from "@/lib/api"
import { byWorkflow, cost, DECISION_LABEL, plural, relativeTime, seconds, usd } from "@/lib/format"
import { go } from "@/lib/route"
import { ROUTE_TONE } from "@/lib/tones"

const ROUTES: Route[] = ["approve", "negotiate", "escalate"]

function batchCost(b: BatchStatus) {
  if (b.done + b.errors === 0) return "–"
  const finished = b.done + b.errors
  if (b.unpriced_runs >= finished) return "local, no API cost"
  const priced = usd(b.priced_cost_usd)
  return b.unpriced_runs ? `${priced} + ${plural(b.unpriced_runs, "unpriced run")}` : priced
}

// --- composer ------------------------------------------------------------------------------------

function ContractCheck({ c, checked, onChange }: { c: ContractSummary; checked: boolean; onChange: (v: boolean) => void }) {
  const id = useId()
  return (
    <li>
      <label
        htmlFor={id}
        className={cn(
          "flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 transition-colors hover:bg-muted",
          checked && "bg-accent"
        )}
      >
        <Checkbox id={id} checked={checked} onCheckedChange={(v) => onChange(v === true)} />
        <span className="min-w-0 flex-1 truncate font-mono text-[0.8rem]">{c.doc_id}</span>
        <LangChips languages={c.languages} />
        <span className="w-9 text-end text-xs text-muted-foreground tabular">{c.clauses} cl.</span>
      </label>
    </li>
  )
}

function BatchComposer({ contracts, onStarted }: { contracts: ContractSummary[] | null; onStarted: (b: string) => void }) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [autoSend, setAutoSend] = useState(true)
  const [busy, setBusy] = useState(false)
  const switchId = useId()
  const samples = contracts?.filter((c) => c.source !== "upload") ?? []
  const uploads = contracts?.filter((c) => c.source === "upload") ?? []

  const toggle = (id: string, on: boolean) =>
    setSelected((s) => {
      const n = new Set(s)
      if (on) n.add(id)
      else n.delete(id)
      return n
    })

  const start = async () => {
    // Keep the list order, not the click order, so batches are easy to compare.
    const ids = (contracts ?? []).map((c) => c.doc_id).filter((d) => selected.has(d))
    setBusy(true)
    try {
      const m = await api.startBatch(ids, autoSend)
      toast.success(`Queue started: ${m.items.length} contracts`, { description: `Batch ${m.batch_id}` })
      setSelected(new Set())
      onStarted(m.batch_id)
    } catch (e) {
      toast.error("Could not start the queue", { description: errorMessage(e) })
    } finally {
      setBusy(false)
    }
  }

  const group = (label: string, list: ContractSummary[]) =>
    list.length > 0 ? (
      <div>
        <p className="px-2 pt-1 pb-1 text-[0.7rem] font-semibold text-muted-foreground">{label}</p>
        <ul className="flex flex-col">
          {list.map((c) => (
            <ContractCheck key={c.doc_id} c={c} checked={selected.has(c.doc_id)} onChange={(v) => toggle(c.doc_id, v)} />
          ))}
        </ul>
      </div>
    ) : null

  return (
    <Card className="shrink-0 gap-4">
      <CardHeader>
        <CardTitle className="font-heading text-lg font-semibold">New batch</CardTitle>
        <CardDescription>
          Hand the agent a stack of contracts. It reviews them in parallel and only brings you what needs a human.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={!samples.length}
            onClick={() => setSelected(new Set(samples.map((c) => c.doc_id)))}
          >
            Select all samples
          </Button>
          <Button variant="ghost" size="sm" disabled={!selected.size} onClick={() => setSelected(new Set())}>
            Clear
          </Button>
          <span className="ms-auto text-xs text-muted-foreground tabular">{selected.size} selected</span>
        </div>
        {contracts ? (
          <div className="max-h-64 overflow-y-auto overscroll-contain rounded-lg border bg-background/60">
            <div className="flex flex-col gap-1 p-1.5">
              {group("Your uploads", uploads)}
              {group("Samples", samples)}
            </div>
          </div>
        ) : (
          <Skeleton className="h-64 w-full" />
        )}

        <div className="flex flex-col gap-2 rounded-lg border bg-background/60 p-3">
          <div className="flex items-start gap-3">
            <Switch id={switchId} checked={autoSend} onCheckedChange={setAutoSend} className="mt-0.5" />
            <Label htmlFor={switchId} className="text-sm leading-snug font-medium">
              Agent sends negotiation redlines automatically
            </Label>
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {autoSend
              ? "Contracts routed to negotiate get their redlines sent without waiting. "
              : "Drafted redlines wait in the Inbox until someone approves them. "}
            Escalations always wait for a lawyer.
          </p>
        </div>

        <Button size="lg" className="h-10 w-full text-sm" disabled={!selected.size || busy} onClick={start}>
          {busy ? <LoaderCircle className="animate-spin" aria-hidden /> : <Play aria-hidden />}
          {selected.size ? `Run queue · ${selected.size} contract${selected.size === 1 ? "" : "s"}` : "Run queue"}
        </Button>
      </CardContent>
    </Card>
  )
}

// --- batch list ----------------------------------------------------------------------------------

function BatchList({ batches, selected }: { batches: BatchStatus[] | null; selected: string | null }) {
  return (
    <Card className="min-h-0 gap-3">
      <CardHeader>
        <CardTitle className="font-heading text-lg font-semibold">Previous batches</CardTitle>
        <CardAction>
          {batches ? <span className="text-xs text-muted-foreground tabular">{batches.length}</span> : null}
        </CardAction>
      </CardHeader>
      <CardContent className="px-2">
        {!batches ? (
          <div className="flex flex-col gap-2 px-2">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        ) : batches.length === 0 ? (
          <p className="px-2 pb-1 text-sm text-muted-foreground">No batches yet.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {batches.map((b) => {
              const active = b.batch_id === selected
              const running = b.done + b.errors < b.total
              return (
                <li key={b.batch_id}>
                  <button
                    type="button"
                    aria-current={active ? "true" : undefined}
                    onClick={() => go({ area: "queue", batchId: b.batch_id })}
                    className={cn(
                      "flex w-full flex-col gap-1.5 rounded-lg border border-transparent px-2.5 py-2 text-start transition-colors outline-none",
                      "hover:bg-muted focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
                      active && "border-border bg-accent"
                    )}
                  >
                    <span className="flex w-full items-center gap-2">
                      <span className="font-mono text-[0.8rem] font-medium">{b.batch_id}</span>
                      <span className="ms-auto text-xs text-muted-foreground">{relativeTime(b.created)}</span>
                    </span>
                    <span className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground tabular">
                      {running ? (
                        <span className="inline-flex items-center gap-1 text-brass-ink">
                          <LoaderCircle className="size-3 animate-spin" aria-hidden />
                          {b.done + b.errors}/{b.total}
                        </span>
                      ) : (
                        <span>{b.total} contracts</span>
                      )}
                      {ROUTES.map((r) =>
                        b.routes[r] ? (
                          <span key={r} className={cn("inline-flex items-center gap-1", ROUTE_TONE[r].text)}>
                            <span aria-hidden className={cn("size-1.5 rounded-full", ROUTE_TONE[r].bar)} />
                            {b.routes[r]} {r}
                          </span>
                        ) : null
                      )}
                      {b.needs_human ? (
                        <span className="inline-flex items-center gap-1 font-medium text-brass-ink">
                          <UserRound className="size-3" aria-hidden />
                          {b.needs_human} waiting
                        </span>
                      ) : null}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

// --- batch detail --------------------------------------------------------------------------------

const SPLIT: { key: Route | "unrouted"; label: string; bar: string; text: string }[] = [
  { key: "approve", label: "approved", bar: "bg-approve", text: "text-approve" },
  { key: "negotiate", label: "negotiate", bar: "bg-negotiate", text: "text-negotiate" },
  { key: "escalate", label: "escalated", bar: "bg-escalate", text: "text-escalate" },
  { key: "unrouted", label: "unrouted", bar: "bg-muted-foreground/50", text: "text-muted-foreground" },
]

/** Route distribution as one proportional bar with a legend, instead of a tile per route. */
function RouteSplit({ b }: { b: BatchStatus }) {
  const parts = SPLIT.filter((p) => (b.routes[p.key] ?? 0) > 0)
  const total = b.total || 1
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex h-2.5 overflow-hidden rounded-sm bg-muted" role="img" aria-label={parts.map((p) => `${b.routes[p.key]} ${p.label}`).join(", ") || "no routes yet"}>
        {parts.map((p) => (
          <span key={p.key} className={p.bar} style={{ width: `${(b.routes[p.key] / total) * 100}%` }} />
        ))}
      </div>
      <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm tabular">
        {SPLIT.filter((p) => p.key !== "unrouted" || b.routes.unrouted > 0).map((p) => (
          <span key={p.key} className={cn("inline-flex items-center gap-1.5", b.routes[p.key] ? p.text : "text-muted-foreground")}>
            <span aria-hidden className={cn("size-2 rounded-[2px]", p.bar, !b.routes[p.key] && "opacity-40")} />
            <span className="font-semibold">{b.routes[p.key] ?? 0}</span> {p.label}
          </span>
        ))}
      </p>
    </div>
  )
}

function ItemStatus({ it }: { it: BatchItem }) {
  if (it.status === "queued")
    return (
      <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
        <Clock className="size-3.5" aria-hidden /> Queued
      </span>
    )
  if (it.status === "running")
    return (
      <span className="inline-flex items-center gap-1.5 text-sm font-medium text-brass-ink">
        <LoaderCircle className="size-3.5 animate-spin" aria-hidden /> Reviewing
      </span>
    )
  if (it.status === "error")
    return (
      <span className="inline-flex items-center gap-1.5 text-sm font-medium text-escalate">
        <CircleX className="size-3.5" aria-hidden /> Failed
      </span>
    )
  return it.route ? (
    <RouteBadge route={it.route} />
  ) : (
    <Badge variant="outline" className="rounded-md text-muted-foreground">
      No route
    </Badge>
  )
}

function HumanState({ it }: { it: BatchItem }) {
  if (it.decision && byWorkflow(it.decided_by))
    return (
      <span className="inline-flex items-center gap-1.5 text-sm font-medium text-approve">
        <Send className="size-3.5" aria-hidden /> Sent automatically (auto-send policy)
      </span>
    )
  if (it.decision)
    return <span className="text-sm font-medium text-foreground">{DECISION_LABEL[it.decision]}</span>
  if (it.pending)
    return (
      <Button
        variant="outline"
        size="xs"
        className="border-brass/50 bg-brass-soft text-brass-ink hover:bg-brass-soft/70"
        onClick={() => go({ area: "inbox" })}
      >
        <UserRound data-icon="inline-start" aria-hidden />
        {it.pending === "legal_review"
          ? "Waiting for a lawyer"
          : it.pending === "unrouted"
            ? "Needs a full lawyer review"
            : "Waiting: approve send"}
      </Button>
    )
  if (it.sent)
    return (
      <span className="inline-flex items-center gap-1.5 text-sm font-medium text-approve">
        <Send className="size-3.5" aria-hidden /> Redlines sent by agent
      </span>
    )
  if (it.status === "done" && it.route === "approve")
    return <span className="text-sm text-muted-foreground">None needed</span>
  return <span className="text-sm text-muted-foreground">–</span>
}

function OpenRun({ it }: { it: BatchItem }) {
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={it.status === "queued"}
      onClick={() => go({ area: "review", runId: it.run_id })}
      aria-label={`Open the review of ${it.doc_id}`}
    >
      Open
      <ArrowUpRight data-icon="inline-end" aria-hidden />
    </Button>
  )
}

function BatchDetail({ batchId }: { batchId: string }) {
  const { data: b, error } = useBatch(batchId)

  if (!b) {
    return error ? (
      <Empty className="border bg-card">
        <EmptyHeader>
          <EmptyTitle>Batch unavailable</EmptyTitle>
          <EmptyDescription>{error}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    ) : (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-64 w-full rounded-lg" />
        <Skeleton className="h-80 w-full rounded-lg" />
      </div>
    )
  }

  const finished = b.done + b.errors
  const running = finished < b.total
  const pct = b.total ? Math.round((finished / b.total) * 100) : 0

  return (
    <div className="flex flex-col gap-5">
      <Card className="gap-5 p-5 sm:p-6">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="">Batch</span>
            <span aria-hidden>·</span>
            <span className="font-mono">{b.batch_id}</span>
            <span aria-hidden>·</span>
            <span>started {relativeTime(b.created)}</span>
            <Badge variant="outline" className="rounded-md font-normal">
              {b.auto_send ? "Agent sends redlines" : "Sends need approval"}
            </Badge>
          </div>
          <h1 className="text-2xl leading-snug font-semibold sm:text-3xl">
            {running
              ? `Reviewing ${b.total} contract${b.total === 1 ? "" : "s"}…`
              : `${b.done} contract${b.done === 1 ? "" : "s"} reviewed`}
            {b.errors ? <span className="text-escalate">{` · ${b.errors} failed`}</span> : null}
          </h1>
          <div className="mt-1 flex items-center gap-3">
            <Progress
              value={pct}
              aria-label="Batch progress"
              className="h-2 flex-1 [&>[data-slot=progress-indicator]]:bg-primary"
            />
            <span className="text-sm text-muted-foreground tabular">
              {finished} / {b.total}
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          {b.needs_human ? (
            <p className="text-base">
              <span className="font-semibold text-brass-ink tabular">{b.needs_human}</span>{" "}
              {b.needs_human === 1 ? "contract needs" : "contracts need"} a person.{" "}
              <button type="button" className="text-primary underline underline-offset-4" onClick={() => go({ area: "inbox" })}>
                Open the Inbox
              </button>
            </p>
          ) : finished ? (
            <p className="text-base">Nothing in this batch needs a person.</p>
          ) : null}
          <RouteSplit b={b} />
          <p className="text-sm text-muted-foreground tabular">
            Cost {batchCost(b)} · agent time {b.agent_minutes.toFixed(1)} min
          </p>
        </div>

        <div className="grid gap-4 rounded-lg border border-primary/25 bg-primary/5 p-4 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center sm:p-5">
          <div className="flex flex-col">
            <span className="flex items-center gap-2 text-xs font-medium text-primary">
              <Hourglass className="size-3.5" aria-hidden />
              Estimated hours saved
            </span>
            <span className="font-heading text-5xl leading-tight font-semibold text-primary tabular">
              ≈ {b.estimate.hours_saved.toFixed(1)} h
            </span>
          </div>
          <div className="flex flex-col gap-1.5 text-sm sm:border-s sm:ps-5">
            <p>
              <span className="tabular">{b.estimate.manual_hours.toFixed(1)} h</span> of manual review for {b.done}{" "}
              contract{b.done === 1 ? "" : "s"}, against{" "}
              <span className="tabular">{b.estimate.human_hours_with_agent.toFixed(2)} h</span> of lawyer time that
              remains for escalations.
            </p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              <span className="font-semibold">An estimate, not a measurement.</span> Assumes {b.estimate.assumptions}.
            </p>
          </div>
        </div>
      </Card>

      <Card className="gap-0 p-0">
        <CardHeader className="border-b py-4">
          <CardTitle className="font-heading text-lg font-semibold">Contracts in this batch</CardTitle>
        </CardHeader>
        <div className="hidden md:block">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50 hover:bg-muted/50">
                <TableHead className="ps-4">Contract</TableHead>
                <TableHead>Result</TableHead>
                <TableHead className="text-end">Risk</TableHead>
                <TableHead>Human step</TableHead>
                <TableHead className="text-end">Cost</TableHead>
                <TableHead className="text-end">Time</TableHead>
                <TableHead className="pe-4">
                  <span className="sr-only">Open</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {b.items.map((it) => (
                <TableRow key={it.run_id}>
                  <TableCell className="ps-4 font-mono text-[0.8rem] font-medium">{it.doc_id}</TableCell>
                  <TableCell>
                    <ItemStatus it={it} />
                  </TableCell>
                  <TableCell className="text-end font-mono tabular">{it.risk_score ?? "–"}</TableCell>
                  <TableCell>
                    <HumanState it={it} />
                  </TableCell>
                  <TableCell className="text-end font-mono text-xs text-muted-foreground tabular">
                    {cost(it.cost_usd, it.priced)}
                  </TableCell>
                  <TableCell className="text-end font-mono text-xs text-muted-foreground tabular">
                    {seconds(it.latency_s)}
                  </TableCell>
                  <TableCell className="pe-4 text-end">
                    <OpenRun it={it} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <ul className="divide-y md:hidden">
          {b.items.map((it) => (
            <li key={it.run_id} className="flex flex-col gap-2 px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate font-mono text-[0.8rem] font-medium">{it.doc_id}</span>
                <ItemStatus it={it} />
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <HumanState it={it} />
                <span className="text-xs text-muted-foreground tabular">
                  risk {it.risk_score ?? "–"} · {seconds(it.latency_s)}
                </span>
                <span className="ms-auto">
                  <OpenRun it={it} />
                </span>
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  )
}

// --- area ----------------------------------------------------------------------------------------

export function QueueView({
  batchId,
  contracts,
  onStarted,
}: {
  batchId: string | null
  contracts: ContractSummary[] | null
  onStarted: () => void
}) {
  const { data: batches, refresh } = useBatches(true)
  const shown = batchId ?? batches?.[0]?.batch_id ?? null

  return (
    <div className="grid gap-6 lg:grid-cols-[20rem_minmax(0,1fr)] lg:grid-rows-[auto_1fr] xl:grid-cols-[22rem_minmax(0,1fr)]">
      <div className="min-w-0 lg:col-start-1 lg:row-start-1">
        <BatchComposer
          contracts={contracts}
          onStarted={(id) => {
            refresh()
            onStarted()
            go({ area: "queue", batchId: id })
          }}
        />
      </div>
      <section className="min-w-0 lg:col-start-2 lg:row-span-2 lg:row-start-1" aria-label="Batch">
        {shown ? (
          <BatchDetail key={shown} batchId={shown} />
        ) : batches ? (
          <Empty className="border bg-card py-16">
            <EmptyHeader>
              <EmptyTitle>No batches yet</EmptyTitle>
              <EmptyDescription>
                Select contracts and run the queue. The agent reviews them in parallel, sends what it may send, and
                puts the rest in the Inbox.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <Skeleton className="h-96 w-full rounded-lg" />
        )}
      </section>
      <div className="min-w-0 lg:col-start-1 lg:row-start-2">
        <BatchList batches={batches} selected={shown} />
      </div>
    </div>
  )
}

