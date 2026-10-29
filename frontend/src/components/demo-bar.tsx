import { ArrowRight, Inbox, LoaderCircle, RotateCcw, X } from "lucide-react"

import { RouteBadge } from "@/components/tone-badges"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { DemoScene } from "@/lib/api"
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
  return (
    <div
      role="region"
      aria-label="Guided demo"
      className="fixed inset-x-0 bottom-0 z-40 px-3 pb-3 sm:px-6 sm:pb-5 print:hidden"
    >
      <div className="mx-auto flex max-w-3xl flex-col gap-3 rounded-xl border border-brass/40 bg-popover/95 p-4 shadow-lg backdrop-blur-md sm:p-5">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="font-medium tracking-[0.14em] text-brass-ink uppercase">
            Guided demo · scene {demo.index + 1} of {demo.scenes.length}
          </span>
          <RouteBadge route={scene.route} />
          <Badge variant="outline" className="rounded-md border-dashed font-normal text-muted-foreground">
            Replay of a recorded <span className="font-mono">{scene.model}</span> run
          </Badge>
          <Button variant="ghost" size="icon-sm" className="ms-auto" onClick={onExit} aria-label="Exit the demo">
            <X aria-hidden />
          </Button>
        </div>
        <div className="flex flex-col gap-1">
          <h2 className="text-lg leading-snug font-semibold">{scene.title}</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">{scene.narration}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="me-auto inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            {demo.busy || !finished ? (
              <>
                <LoaderCircle className="size-3.5 animate-spin" aria-hidden /> Replaying: findings and red flags fill in live
              </>
            ) : (
              "Replay finished"
            )}
          </span>
          <Button variant="ghost" size="sm" onClick={onRestart} disabled={demo.busy}>
            <RotateCcw aria-hidden />
            Restart demo
          </Button>
          {scene.route === "escalate" && finished ? (
            <Button variant="outline" size="sm" onClick={() => go({ area: "inbox" })}>
              <Inbox aria-hidden />
              Open the Inbox
            </Button>
          ) : null}
          <Button size="sm" onClick={onNext} disabled={demo.busy}>
            {last ? "Finish" : "Next scene"}
            <ArrowRight data-icon="inline-end" aria-hidden />
            <kbd className="ms-1 hidden rounded border border-primary-foreground/30 px-1 font-mono text-[0.65rem] sm:inline">→</kbd>
          </Button>
        </div>
      </div>
    </div>
  )
}
