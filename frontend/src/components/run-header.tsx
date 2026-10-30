import { CircleX, Clapperboard, LoaderCircle } from "lucide-react"

import { DataLine } from "@/components/data-policy"
import { RouteBadge } from "@/components/tone-badges"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import type { ContractSummary, ReviewView } from "@/lib/api"
import type { RunPhase } from "@/hooks/use-api"
import { contractTitle, langOf } from "@/lib/format"

interface Props {
  runId: string
  phase: RunPhase
  review: ReviewView | null
  contract: ContractSummary | null
  task: string | null
}

export function RunHeader({ runId, phase, review, contract, task }: Props) {
  const title = contract ? contractTitle(contract.title) : null
  const running = phase === "starting" || review?.status === "running" || review?.status === "starting"
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span className="">Review</span>
        <span aria-hidden>·</span>
        <span className="font-mono break-all">{runId}</span>
        {review?.replay_of ? (
          <Badge
            variant="outline"
            title={`Replays ${review.replay_of}`}
            className="gap-1 rounded-md border-dashed border-brass/60 text-brass-ink"
          >
            <Clapperboard data-icon="inline-start" aria-hidden />
            Replay of a recorded run
          </Badge>
        ) : null}
        {running ? (
          <Badge variant="outline" className="gap-1 rounded-md border-brass/50 bg-brass-soft text-brass-ink">
            <LoaderCircle className="animate-spin" data-icon="inline-start" aria-hidden />
            {phase === "starting" ? "Starting" : review?.replay_of ? "Replaying" : "Live"}
          </Badge>
        ) : review?.status === "error" ? (
          <Badge variant="outline" className="gap-1 rounded-md border-escalate/40 bg-escalate-soft text-escalate">
            <CircleX data-icon="inline-start" aria-hidden />
            Run failed
          </Badge>
        ) : review?.route ? (
          <RouteBadge route={review.route} />
        ) : null}
      </div>
      {title ? (
        <>
          <h1 dir="auto" lang={langOf(title.primary)} className="text-2xl leading-snug font-semibold text-balance sm:text-3xl">
            {title.primary}
          </h1>
          {title.secondary ? (
            <p dir="auto" lang={langOf(title.secondary)} className="font-heading text-lg text-muted-foreground">
              {title.secondary}
            </p>
          ) : null}
        </>
      ) : phase === "error" ? (
        <h1 className="text-2xl font-semibold sm:text-3xl">Run unavailable</h1>
      ) : phase === "ready" && review?.status !== "running" ? (
        <h1 dir="auto" className="text-2xl leading-snug font-semibold text-balance sm:text-3xl">
          {task || "A run that did not load a contract"}
        </h1>
      ) : (
        <Skeleton className="h-9 w-3/4" />
      )}
      {review?.data_policy ? <DataLine policy={review.data_policy} /> : null}
    </div>
  )
}
