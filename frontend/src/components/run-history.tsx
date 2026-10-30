import { CircleX, LoaderCircle, UserRound } from "lucide-react"
import { cn } from "cn"
import { useEffect, useId, useState } from "react"

import { RouteBadge } from "@/components/tone-badges"
import { ARRIVE_TOP, REVEAL, useArrivals } from "@/hooks/use-arrivals"
import { Badge } from "@/components/ui/badge"
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"
import { prefetchRun } from "@/hooks/use-api"
import type { RunSummary } from "@/lib/api"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { cost, isEvalRun, NEEDS_HUMAN_LABEL, relativeTime, seconds } from "@/lib/format"

function useNow(ms: number) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(id)
  }, [ms])
  return now
}

interface Props {
  runs: RunSummary[] | null
  selectedId: string | null
  onSelect: (run: RunSummary) => void
  className?: string
}

const SHOW_EVAL_KEY = "mizan-show-eval-runs"

function readShowEval(): boolean {
  try {
    return localStorage.getItem(SHOW_EVAL_KEY) === "1"
  } catch {
    return false
  }
}

export function RunHistory({ runs, selectedId, onSelect, className }: Props) {
  const now = useNow(30_000)
  const [showEval, setShowEval] = useState(readShowEval)
  const toggleEval = (v: boolean) => {
    setShowEval(v)
    try {
      localStorage.setItem(SHOW_EVAL_KEY, v ? "1" : "0")
    } catch {
      /* storage blocked: the choice lasts for this page view */
    }
  }
  const switchId = useId()
  // Runs that never loaded a contract (smoke tests) are not contract reviews, except failed or running ones.
  const reviews =
    runs?.filter(
      (r) => (r.doc_id || r.status !== "done") && (showEval || !isEvalRun(r.run_id) || r.run_id === selectedId)
    ) ?? null
  const isNewRun = useArrivals(reviews?.map((r) => r.run_id))
  const isNewRoute = useArrivals(reviews?.filter((r) => r.route).map((r) => `${r.run_id}:${r.route}`))

  return (
    <Card className={cn("min-h-0 gap-3", className)}>
      <CardHeader>
        <CardTitle className="font-heading text-lg font-semibold">History</CardTitle>
        <CardAction>
          <Label htmlFor={switchId} className="flex min-h-9 cursor-pointer items-center gap-2 px-1 text-xs font-normal text-muted-foreground">
            <Switch id={switchId} checked={showEval} onCheckedChange={toggleEval} />
            Show eval runs
          </Label>
        </CardAction>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col px-0">
        {!reviews ? (
          <div className="flex flex-col gap-2 px-4">
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : reviews.length === 0 ? (
          <Empty className="mx-4 border">
            <EmptyHeader>
              <EmptyTitle>No reviews yet</EmptyTitle>
              <EmptyDescription>Start a review above.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          // On wide screens the list fills what the sticky column leaves: the viewport is pinned to the
          // area's edges, because a percentage height does not resolve inside a max-height column.
          <ScrollArea className="h-80 lg:h-auto lg:min-h-40 lg:flex-1" viewportClassName="lg:absolute lg:inset-0">
            <ul className="flex flex-col gap-1 px-2 pb-1">
              {reviews.map((r) => {
                const active = r.run_id === selectedId
                return (
                  <li key={r.run_id} className={cn("min-w-0", isNewRun(r.run_id) && ARRIVE_TOP)}>
                    <button
                      type="button"
                      onClick={() => onSelect(r)}
                      onPointerEnter={() => prefetchRun(r.run_id, r.doc_id)}
                      onFocus={() => prefetchRun(r.run_id, r.doc_id)}
                      aria-current={active ? "true" : undefined}
                      className={cn(
                        "group flex w-full min-w-0 flex-col gap-1.5 rounded-lg border border-transparent px-2.5 py-2 text-start transition-colors outline-none",
                        "hover:bg-muted focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
                        active && "border-border bg-accent"
                      )}
                    >
                      <span className="flex w-full items-center gap-2">
                        <span className="min-w-0 flex-1 truncate font-mono text-[0.8rem] font-medium">
                          {r.doc_id ?? "starting…"}
                        </span>
                        {r.replay_of ? (
                          <Badge variant="outline" className="rounded-sm border-dashed text-[0.7rem] font-normal text-brass-ink">
                            Replay
                          </Badge>
                        ) : null}
                        {r.status === "running" ? (
                          <Badge variant="outline" className="gap-1 rounded-md border-brass/50 bg-brass-soft text-brass-ink">
                            <LoaderCircle className="animate-spin" data-icon="inline-start" aria-hidden />
                            Running
                          </Badge>
                        ) : r.status === "error" ? (
                          <Badge variant="outline" className="gap-1 rounded-md border-escalate/40 bg-escalate-soft text-escalate">
                            <CircleX data-icon="inline-start" aria-hidden />
                            Failed
                          </Badge>
                        ) : r.route ? (
                          <RouteBadge
                            route={r.route}
                            className={cn("shrink-0", isNewRoute(`${r.run_id}:${r.route}`) && REVEAL)}
                          />
                        ) : (
                          <Badge variant="outline" className="rounded-md text-muted-foreground">
                            No route
                          </Badge>
                        )}
                      </span>
                      <span className="flex w-full items-center gap-2 text-xs text-muted-foreground tabular">
                        <span>{cost(r.cost_usd, r.priced)}</span>
                        <span aria-hidden>·</span>
                        <span>{seconds(r.latency_s)}</span>
                        {r.needs_human ? (
                          <span className="inline-flex items-center gap-1 font-medium text-brass-ink">
                            <UserRound className="size-3" aria-hidden />
                            {NEEDS_HUMAN_LABEL[r.needs_human]}
                          </span>
                        ) : null}
                        <span className="ms-auto">{relativeTime(r.started, now)}</span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  )
}
