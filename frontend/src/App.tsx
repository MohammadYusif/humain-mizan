import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"

import { AppHeader, AreaNav } from "@/components/app-header"
import { DemoBar, type DemoState } from "@/components/demo-bar"
import { InboxView } from "@/components/inbox-view"
import { InsightsView } from "@/components/insights-view"
import { PrintMemo } from "@/components/print-memo"
import { ProofView } from "@/components/proof-view"
import { QueueView } from "@/components/queue-view"
import { ReviewArea } from "@/components/review-area"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Tabs, TabsContent } from "@/components/ui/tabs"
import { useContracts, useInbox, usePolled, useResource, useRuns } from "@/hooks/use-api"
import { api, errorMessage, type DemoScene } from "@/lib/api"
import { go, parseHash, printRunFromHash, type Area, type Loc } from "@/lib/route"

const loadHealth = () => api.health()
const loadPlaybook = () => api.playbook()

function typing(t: EventTarget | null) {
  const el = t as HTMLElement | null
  return !!el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName))
}

export default function App() {
  const health = useResource("health", loadHealth)
  const contracts = useContracts()
  const playbook = usePolled("playbook", loadPlaybook, () => null)
  const { data: inboxItems, error: inboxError, refresh: refreshInbox } = useInbox()
  const [posting, setPosting] = useState(false)
  const [demo, setDemo] = useState<DemoState | null>(null)
  const { runs, refresh: refreshRuns } = useRuns(posting || demo !== null)

  const [loc, setLoc] = useState<Loc>(() => parseHash(window.location.hash))
  const [printRun, setPrintRun] = useState<string | null>(() => printRunFromHash(window.location.hash))
  const [lastRun, setLastRun] = useState<string | null>(loc.runId)
  const [lastBatch, setLastBatch] = useState<string | null>(loc.batchId)

  // The hash is the single source of truth for where we are; back/forward and pasted links just work.
  useEffect(() => {
    const onHash = () => {
      const l = parseHash(window.location.hash)
      setPrintRun(printRunFromHash(window.location.hash))
      setLoc(l)
      if (l.area === "review") setLastRun(l.runId)
      if (l.area === "queue" && l.batchId) setLastBatch(l.batchId)
      window.scrollTo({ top: 0 })
    }
    window.addEventListener("hashchange", onHash)
    return () => window.removeEventListener("hashchange", onHash)
  }, [])

  const openArea = useCallback(
    (area: Area) => go({ area, runId: area === "review" ? lastRun : null, batchId: area === "queue" ? lastBatch : null }),
    [lastRun, lastBatch]
  )

  const onDecided = useCallback(() => {
    refreshInbox()
    refreshRuns()
  }, [refreshInbox, refreshRuns])

  // ---- guided demo: replays of recorded runs, scene by scene ----------------------------------------
  const playScene = useCallback(
    async (scenes: DemoScene[], index: number) => {
      setDemo({ scenes, index, runId: null, busy: true })
      try {
        const { run_id } = await api.demoReplay(scenes[index].id)
        setDemo({ scenes, index, runId: run_id, busy: false })
        go({ area: "review", runId: run_id })
        refreshRuns()
      } catch (e) {
        setDemo({ scenes, index, runId: null, busy: false })
        toast.error("Could not start the replay", { description: errorMessage(e) })
      }
    },
    [refreshRuns]
  )

  const startDemo = useCallback(async () => {
    try {
      const scenes = await api.demoScenes()
      if (!scenes.length) return void toast.error("No demo scenes are available on this server.")
      await playScene(scenes, 0)
    } catch (e) {
      toast.error("Could not load the demo", { description: errorMessage(e) })
    }
  }, [playScene])

  const nextScene = useCallback(() => {
    if (!demo || demo.busy) return
    if (demo.index + 1 < demo.scenes.length) void playScene(demo.scenes, demo.index + 1)
    else {
      setDemo(null)
      toast.success("End of the guided demo")
    }
  }, [demo, playScene])

  const restartDemo = useCallback(async () => {
    if (!demo) return
    try {
      const { deleted } = await api.demoReset()
      toast.success(`Demo reset: ${deleted} replayed run${deleted === 1 ? "" : "s"} removed`)
      refreshInbox()
      await playScene(demo.scenes, 0)
    } catch (e) {
      toast.error("Could not reset the demo", { description: errorMessage(e) })
    }
  }, [demo, playScene, refreshInbox])

  const exitDemo = useCallback(async () => {
    setDemo(null)
    // Leave a replay for the start screen (or the last real run) before its files disappear.
    const real = lastRun && !lastRun.startsWith("demo-") ? lastRun : null
    if (loc.area === "review" && loc.runId?.startsWith("demo-")) go({ area: "review", runId: real })
    if (lastRun?.startsWith("demo-")) setLastRun(real)
    try {
      const { deleted } = await api.demoReset()
      toast.success(`Demo closed: ${deleted} replayed run${deleted === 1 ? "" : "s"} removed`)
    } catch (e) {
      toast.error("Could not clean up the demo", { description: errorMessage(e) })
    } finally {
      refreshRuns()
      refreshInbox()
    }
  }, [lastRun, loc, refreshInbox, refreshRuns])

  // Tab title per area (the print memo view sets its own and restores this on unmount).
  useEffect(() => {
    if (printRun) return
    const names: Record<Area, string> = { review: "Review", queue: "Queue", inbox: "Inbox", insights: "Insights", proof: "Proof" }
    document.title = `Mizan · ${names[loc.area]}`
  }, [loc.area, printRun])

  useEffect(() => {
    if (!demo) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "ArrowRight" || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || typing(e.target)) return
      e.preventDefault()
      nextScene()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [demo, nextScene])

  const demoRun = demo?.runId ? runs?.find((r) => r.run_id === demo.runId) : undefined
  const demoFinished = !!demoRun && demoRun.status !== "running"

  if (printRun) return <PrintMemo runId={printRun} contracts={contracts.data} />

  return (
    <Tabs value={loc.area} onValueChange={(v) => openArea(v as Area)} className="min-h-dvh gap-0">
      <AppHeader
        health={health.data}
        healthError={health.error}
        nav={<AreaNav inboxCount={inboxItems?.length ?? null} />}
        onDemo={demo ? undefined : () => void startDemo()}
      />
      <main className={demo ? "mx-auto w-full max-w-[1440px] px-4 pt-6 pb-40 sm:px-6 sm:pb-72 lg:pt-8" : "mx-auto w-full max-w-[1440px] px-4 py-6 sm:px-6 lg:py-8"}>
        {contracts.error && !contracts.data ? (
          <Alert className="mb-6 border-escalate/40 bg-escalate-soft text-escalate">
            <AlertTitle>Cannot reach the review API</AlertTitle>
            <AlertDescription className="text-foreground/80">
              {contracts.error}. Start it with <code className="font-mono">uv run hack serve</code>.
            </AlertDescription>
          </Alert>
        ) : null}

        {/* Kept mounted so an in-flight review keeps its live state while you look at other areas. */}
        <TabsContent value="review" forceMount className="data-[state=inactive]:hidden">
          <ReviewArea
            runId={loc.area === "review" ? loc.runId : lastRun}
            contracts={contracts.data}
            refreshContracts={contracts.refresh}
            runs={runs}
            refreshRuns={refreshRuns}
            posting={posting}
            setPosting={setPosting}
            playbook={playbook.data}
          />
        </TabsContent>
        <TabsContent value="queue">
          <QueueView batchId={loc.batchId ?? lastBatch} contracts={contracts.data} onStarted={refreshRuns} />
        </TabsContent>
        <TabsContent value="inbox">
          <InboxView
            items={inboxItems}
            error={inboxError}
            contracts={contracts.data}
            runs={runs}
            onDecided={onDecided}
          />
        </TabsContent>
        <TabsContent value="insights">
          <InsightsView rules={playbook.data} onChanged={playbook.refresh} onDemo={demo ? undefined : () => void startDemo()} />
        </TabsContent>
        <TabsContent value="proof">
          <ProofView contracts={contracts.data} />
        </TabsContent>
      </main>
      {demo ? (
        <DemoBar
          demo={demo}
          finished={demoFinished}
          onNext={nextScene}
          onRestart={() => void restartDemo()}
          onExit={() => void exitDemo()}
        />
      ) : null}
    </Tabs>
  )
}
