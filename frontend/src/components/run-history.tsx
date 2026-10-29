import { CircleX, History, LoaderCircle, UserRound } from "lucide-react"
import { cn } from "cn"
import { useEffect, useState } from "react"

import { RouteBadge } from "@/components/tone-badges"
import { Badge } from "@/components/ui/badge"
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"
import type { RunSummary } from "@/lib/api"
import { cost, NEEDS_HUMAN_LABEL, relativeTime, seconds } from "@/lib/format"

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

export function RunHistory({ runs, selectedId, onSelect, className }: Props) {
  const now = useNow(30_000)
  // Runs that never loaded a contract (smoke tests, calculator evals) are not contract reviews.
  const reviews = runs?.filter((r) => r.doc_id || r.status === "running") ?? null

  return (
    <Card className={cn("min-h-0 gap-3", className)}>
      <CardHeader>
        <CardTitle className="font-heading text-lg font-semibold">History</CardTitle>
        <CardAction>
          {reviews ? (
            <span className="text-xs text-muted-foreground tabular">{reviews.length} runs</span>
          ) : null}
        </CardAction>
      </CardHeader>
      <CardContent className="min-h-0 flex-1 px-0">
        {!reviews ? (
          <div className="flex flex-col gap-2 px-4">
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : reviews.length === 0 ? (
          <Empty className="mx-4 border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <History aria-hidden />
              </EmptyMedia>
              <EmptyTitle>No reviews yet</EmptyTitle>
              <EmptyDescription>Runs appear here as soon as the agent writes its first event.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ScrollArea className="h-80 lg:h-full">
            <ul className="flex flex-col gap-1 px-2 pb-1">
              {reviews.map((r) => {
                const active = r.run_id === selectedId
                return (
                  <li key={r.run_id}>
                    <button
                      type="button"
                      onClick={() => onSelect(r)}
                      aria-current={active ? "true" : undefined}
                      className={cn(
                        "group flex w-full flex-col gap-1.5 rounded-lg border border-transparent px-2.5 py-2 text-start transition-colors outline-none",
                        "hover:bg-muted focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
                        active && "border-border bg-accent"
                      )}
                    >
                      <span className="flex w-full items-center gap-2">
                        <span className="min-w-0 flex-1 truncate font-mono text-[0.8rem] font-medium">
                          {r.doc_id ?? "starting…"}
                        </span>
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
                          <RouteBadge route={r.route} />
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
