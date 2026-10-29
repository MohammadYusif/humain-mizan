import { useCallback, useEffect, useState } from "react"

import { AppHeader, AreaNav } from "@/components/app-header"
import { InboxView } from "@/components/inbox-view"
import { ProofView } from "@/components/proof-view"
import { QueueView } from "@/components/queue-view"
import { ReviewArea } from "@/components/review-area"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Tabs, TabsContent } from "@/components/ui/tabs"
import { useContracts, useInbox, useResource, useRuns } from "@/hooks/use-api"
import { api } from "@/lib/api"
import { go, parseHash, type Area, type Loc } from "@/lib/route"

const loadHealth = () => api.health()

export default function App() {
  const health = useResource("health", loadHealth)
  const contracts = useContracts()
  const { data: inboxItems, error: inboxError, refresh: refreshInbox } = useInbox()
  const [posting, setPosting] = useState(false)
  const { runs, refresh: refreshRuns } = useRuns(posting)

  const [loc, setLoc] = useState<Loc>(() => parseHash(window.location.hash))
  const [lastRun, setLastRun] = useState<string | null>(loc.runId)
  const [lastBatch, setLastBatch] = useState<string | null>(loc.batchId)

  // The hash is the single source of truth for where we are; back/forward and pasted links just work.
  useEffect(() => {
    const onHash = () => {
      const l = parseHash(window.location.hash)
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

  return (
    <Tabs value={loc.area} onValueChange={(v) => openArea(v as Area)} className="min-h-dvh gap-0">
      <AppHeader
        health={health.data}
        healthError={health.error}
        nav={<AreaNav inboxCount={inboxItems?.length ?? null} />}
      />
      <main className="mx-auto w-full max-w-[1440px] px-4 py-6 sm:px-6 lg:py-8">
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
        <TabsContent value="proof">
          <ProofView contracts={contracts.data} />
        </TabsContent>
      </main>
    </Tabs>
  )
}
