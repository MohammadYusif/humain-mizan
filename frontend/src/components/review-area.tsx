import { BookMarked, ChevronDown, FileText, ListTree, ScrollText } from "lucide-react"
import { cn } from "cn"
import { useCallback, useMemo, useState } from "react"
import { toast } from "sonner"

import { ContractTab, type ClauseFocus } from "@/components/contract-tab"
import { Intro } from "@/components/intro"
import { NewReviewPanel } from "@/components/new-review-panel"
import { PlaybookTab } from "@/components/playbook-tab"
import { ReviewTab, ReviewTabSkeleton } from "@/components/review-tab"
import { RunHeader } from "@/components/run-header"
import { RunHistory } from "@/components/run-history"
import { StatsStrip } from "@/components/stats-strip"
import { TraceTab } from "@/components/trace-tab"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { UploadContractDialog } from "@/components/upload-contract-dialog"
import { useContract, useRunData } from "@/hooks/use-api"
import { api, errorMessage, newRunId, type ContractSummary, type PlaybookRule, type RunSummary } from "@/lib/api"
import { ROUTE_LABEL, seconds, usd } from "@/lib/format"
import { go } from "@/lib/route"

type Tab = "review" | "contract" | "trace" | "playbook"

/** On narrow screens the workspace sits below the side panel: bring it into view after choosing a run. */
function revealWorkspace() {
  if (!window.matchMedia("(max-width: 1023px)").matches) return
  requestAnimationFrame(() => document.getElementById("workspace")?.scrollIntoView({ behavior: "smooth", block: "start" }))
}

interface Props {
  runId: string | null
  contracts: ContractSummary[] | null
  refreshContracts: () => void
  runs: RunSummary[] | null
  refreshRuns: () => void
  posting: boolean
  setPosting: (v: boolean) => void
  playbook: PlaybookRule[] | null
}

export function ReviewArea({ runId, contracts, refreshContracts, runs, refreshRuns, posting, setPosting, playbook }: Props) {
  const [pickedDoc, setDocId] = useState<string | null>(null)
  const [liveRunId, setLiveRunId] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>("review")
  const [focus, setFocus] = useState<ClauseFocus | null>(null)
  const [liveDoc, setLiveDoc] = useState<string | null>(null)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [panelOpen, setPanelOpen] = useState(false)

  const live = posting && runId !== null && runId === liveRunId
  const { review, trace, phase, error: runError } = useRunData(runId, live)

  // Opening a run (History, #run= link, Inbox, Queue) makes the picker follow that run's contract:
  // a manual pick only lasts until another run is opened.
  const [pickRun, setPickRun] = useState(runId)
  if (runId !== pickRun) {
    setPickRun(runId)
    if (runId && runId !== liveRunId) setDocId(null)
    if (runId) setTab("review")
  }

  const runSummary = runs?.find((r) => r.run_id === runId) ?? null
  const known = (d: string | null | undefined) => (d && contracts?.some((c) => c.doc_id === d) ? d : null)
  const docId =
    pickedDoc ??
    known(review?.doc_id) ??
    known(runSummary?.doc_id) ??
    (live ? liveDoc : null) ??
    contracts?.[0]?.doc_id ??
    null
  const viewDoc = runId ? (review?.doc_id ?? runSummary?.doc_id ?? (live ? liveDoc : null)) : docId
  const contract = useContract(viewDoc)
  const viewContract = useMemo(() => contracts?.find((c) => c.doc_id === viewDoc) ?? null, [contracts, viewDoc])

  const selectRun = useCallback((r: RunSummary) => {
    go({ area: "review", runId: r.run_id })
    setFocus(null)
    revealWorkspace()
  }, [])

  const jumpToClause = useCallback((clauseId: string) => {
    setTab("contract")
    setFocus({ id: clauseId, nonce: Date.now() })
  }, [])

  const startReview = useCallback(
    async (doc: string | null = docId) => {
      if (!doc || posting) return
      const id = newRunId()
      setDocId(doc)
      setLiveDoc(doc)
      setLiveRunId(id)
      setPosting(true)
      go({ area: "review", runId: id })
      setTab("review")
      setFocus(null)
      refreshRuns()
      revealWorkspace()
      try {
        const r = await api.run(`Review contract ${doc} and route it.`, id)
        toast.success(r.route ? `${doc}: ${ROUTE_LABEL[r.route]}` : `${doc}: finished without a valid route`, {
          description: `${r.turns} turns${r.cost_usd > 0 ? ` · ${usd(r.cost_usd)}` : ""} · ${seconds(r.latency_s)}`,
        })
      } catch (e) {
        toast.error("Review failed", { description: errorMessage(e) })
      } finally {
        setPosting(false)
        refreshRuns()
      }
    },
    [docId, posting, refreshRuns, setPosting]
  )

  const running = phase === "starting" || review?.status === "running" || review?.status === "starting"
  const traceCount = trace?.length ?? 0

  return (
    <div className="grid gap-6 lg:grid-cols-[20rem_minmax(0,1fr)] xl:grid-cols-[22rem_minmax(0,1fr)]">
      <Collapsible
        open={panelOpen || !runId}
        onOpenChange={setPanelOpen}
        className={cn(
          "flex min-w-0 flex-col gap-3 lg:sticky lg:top-24 lg:max-h-[calc(100dvh-7.5rem)] lg:gap-6 lg:self-start",
          runId && "max-lg:order-last"
        )}
      >
        {runId ? (
          <CollapsibleTrigger asChild>
            <Button variant="outline" className="group h-10 w-full justify-between bg-card lg:hidden">
              New review and history
              <ChevronDown className="transition-transform group-data-[state=open]:rotate-180" aria-hidden />
            </Button>
          </CollapsibleTrigger>
        ) : null}
        <CollapsibleContent forceMount className="flex min-h-0 flex-col gap-6 data-[state=closed]:max-lg:hidden lg:flex-1">
        <NewReviewPanel
          contracts={contracts}
          docId={docId}
          onDocChange={(id) => {
            setDocId(id)
            if (!posting) go({ area: "review" })
          }}
          onReview={() => void startReview()}
          onUpload={() => setUploadOpen(true)}
          busy={posting}
        />
        <RunHistory runs={runs} selectedId={runId} onSelect={selectRun} className="lg:flex-1" />
        </CollapsibleContent>
      </Collapsible>

      <UploadContractDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        reviewBusy={posting}
        onAdded={(c) => {
          refreshContracts()
          setDocId(c.doc_id)
          if (!posting) go({ area: "review" })
        }}
        onReviewNow={(doc) => void startReview(doc)}
      />

      <section id="workspace" className="flex min-w-0 scroll-mt-36 flex-col gap-5" aria-label="Review workspace">
        {runId ? (
          <>
            <RunHeader runId={runId} phase={phase} review={review} contract={viewContract} task={runSummary?.task ?? null} />
            <StatsStrip review={review} trace={trace} />
          </>
        ) : null}

        <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="gap-5">
          <TabsList className="grid h-10! w-full grid-cols-4 sm:inline-flex sm:w-fit">
            <TabsTrigger value="review" className="px-3">
              <ScrollText aria-hidden className="hidden sm:block" />
              Findings
            </TabsTrigger>
            <TabsTrigger value="contract" className="px-3">
              <FileText aria-hidden className="hidden sm:block" />
              Contract
            </TabsTrigger>
            <TabsTrigger value="trace" className="px-3">
              <ListTree aria-hidden className="hidden sm:block" />
              Trace
              {traceCount > 0 ? (
                <Badge variant="secondary" className="hidden h-4.5 rounded-sm px-1.5 font-mono text-[0.7rem] tabular sm:inline-flex">
                  {traceCount}
                </Badge>
              ) : null}
            </TabsTrigger>
            <TabsTrigger value="playbook" className="px-3">
              <BookMarked aria-hidden className="hidden sm:block" />
              Playbook
            </TabsTrigger>
          </TabsList>

          <TabsContent value="review">
            {!runId ? (
              <Intro onUpload={() => setUploadOpen(true)} />
            ) : phase === "error" ? (
              <Empty className="border bg-card">
                <EmptyHeader>
                  <EmptyTitle>Could not load this run</EmptyTitle>
                  <EmptyDescription>{runError}</EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : review ? (
              <ReviewTab review={review} onJump={jumpToClause} runId={runId} />
            ) : (
              <ReviewTabSkeleton />
            )}
          </TabsContent>
          <TabsContent value="contract">
            <ContractTab
              contract={contract.data}
              loading={contract.loading}
              error={contract.error ?? (runId && !viewDoc && !running ? "This run did not load a contract." : null)}
              findings={runId ? (review?.findings ?? []) : []}
              clauseMap={runId ? (review?.clause_map ?? null) : null}
              focus={focus}
              injected={runId ? (review?.injected ?? []) : []}
              tripwires={runId ? (review?.tripwires ?? []) : []}
            />
          </TabsContent>
          <TabsContent value="trace">
            {runId ? (
              <TraceTab key={runId} trace={trace} running={running} />
            ) : (
              <Empty className="border bg-card">
                <EmptyHeader>
                  <EmptyTitle>No run selected</EmptyTitle>
                  <EmptyDescription>Open a run from History to see its model and tool calls.</EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}
          </TabsContent>
          <TabsContent value="playbook">
            <PlaybookTab rules={playbook} />
          </TabsContent>
        </Tabs>
      </section>
    </div>
  )
}
