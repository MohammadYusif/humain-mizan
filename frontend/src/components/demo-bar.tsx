import { ArrowRight, ChevronDown, Inbox, LoaderCircle, RotateCcw, X } from "lucide-react"

import { RouteBadge } from "@/components/tone-badges"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import type { DemoScene } from "@/lib/api"
import { modelName } from "@/lib/format"
import { go } from "@/lib/route"

export interface DemoState {
  scenes: DemoScene[]
  index: number
  runId: string | null
  busy: boolean
}

interface Props {
  demo: DemoState
  finished: boolean
  onNext: () => void
  onRestart: () => void
  onExit: () => void
}

/** Caption card for the guided demo: which scene, what to look at, and the controls (→ = next scene). */
export function DemoBar({ demo, finished, onNext, onRestart, onExit }: Props) {
  const scene = demo.scenes[demo.index]
  const last = demo.index === demo.scenes.length - 1
  const playing = demo.busy || !finished
  return (
    // The wrapper spans the viewport but must not swallow clicks outside the card.
    <div
      role="region"
      aria-label="Guided demo"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-2 pb-2 sm:px-6 sm:pb-5 print:hidden"
    >
      <Collapsible className="pointer-events-auto mx-auto flex max-w-3xl flex-col gap-2 rounded-lg border bg-popover p-3 shadow-md sm:gap-3 sm:p-5">
        <div className="flex items-start gap-2">
          <span className="shrink-0 pt-0.5 text-xs text-muted-foreground tabular sm:pt-1.5">
            {demo.index + 1}/{demo.scenes.length}
          </span>
          {/* The whole title, wrapping if it must: never cut off. */}
          <h2
            key={scene.id}
            className="min-w-0 flex-1 text-sm font-semibold text-balance animate-in fade-in-0 slide-in-from-bottom-1 duration-300 sm:text-lg"
          >
            {scene.title}
          </h2>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="icon" className="group size-9 sm:hidden" aria-label="Show the narration">
              <ChevronDown className="transition-transform group-data-[state=open]:rotate-180" aria-hidden />
            </Button>
          </CollapsibleTrigger>
          <Button variant="ghost" size="icon" className="size-9" onClick={onExit} aria-label="Exit the demo">
            <X aria-hidden />
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <RouteBadge route={scene.route} />
          <Badge variant="outline" className="rounded-sm border-dashed font-normal text-muted-foreground">
            Replay of a recorded {modelName(scene.model)} run
          </Badge>
        </div>
        {/* Narration: always shown from sm up; on phones it sits behind the chevron to keep the bar short. */}
        <CollapsibleContent forceMount className="data-[state=closed]:max-sm:hidden">
          <p key={scene.id} className="max-w-[68ch] text-sm leading-relaxed text-muted-foreground animate-in fade-in-0 duration-500">
            {scene.narration}
          </p>
        </CollapsibleContent>
        <div className="flex items-center gap-2">
          <span className="me-auto inline-flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
            {playing ? <LoaderCircle className="size-3.5 shrink-0 animate-spin" aria-hidden /> : null}
            <span className="truncate">{playing ? "Replaying" : "Replay finished"}</span>
          </span>
          <Button variant="ghost" className="h-9" onClick={onRestart} disabled={demo.busy} aria-label="Restart demo">
            <RotateCcw aria-hidden />
            <span className="hidden sm:inline">Restart demo</span>
          </Button>
          {scene.route === "escalate" && finished ? (
            <Button variant="outline" className="h-9" onClick={() => go({ area: "inbox" })}>
              <Inbox aria-hidden />
              <span className="hidden sm:inline">Open the Inbox</span>
              <span className="sm:hidden">Inbox</span>
            </Button>
          ) : null}
          <Button className="h-9" onClick={onNext} disabled={demo.busy}>
            {last ? "Finish" : "Next scene"}
            <ArrowRight data-icon="inline-end" aria-hidden />
            <kbd className="ms-1 hidden rounded-sm border border-primary-foreground/30 px-1 font-mono text-[0.7rem] sm:inline">→</kbd>
          </Button>
        </div>
      </Collapsible>
    </div>
  )
}
