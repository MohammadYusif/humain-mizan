import { BookCheck, Check, Info, LoaderCircle, ShieldAlert, X } from "lucide-react"
import { cn } from "cn"
import { useId, useState } from "react"
import { toast } from "sonner"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { usePolled } from "@/hooks/use-api"
import { api, errorMessage, type InsightEvidence, type PlaybookRule, type Proposal } from "@/lib/api"
import { DECISION_LABEL, langOf, plural, relativeTime } from "@/lib/format"
import { go } from "@/lib/route"

const loadInsights = () => api.insights()

function Evidence({ items }: { items: InsightEvidence[] }) {
  return (
    <ul className="flex flex-col gap-2">
      {items.map((e, i) => (
        <li key={`${e.run_id}-${e.clause_id}-${i}`} className="flex flex-col gap-1 rounded-lg border bg-background/60 p-2.5">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <span className="font-mono">{e.doc_id ?? "–"}</span>
            <span className="font-mono">{e.clause_id}</span>
            <Badge variant="outline" className="rounded-md font-normal">
              {DECISION_LABEL[e.decision] ?? e.decision}
            </Badge>
            <Button variant="link" size="xs" className="ms-auto h-auto p-0" onClick={() => go({ area: "review", runId: e.run_id })}>
              Open run
            </Button>
          </span>
          <blockquote dir="auto" lang={langOf(e.quote)} className="text-sm">
            {e.quote}
          </blockquote>
          {e.note ? (
            <p dir="auto" className="text-xs text-muted-foreground">
              Lawyer's note: {e.note}
            </p>
          ) : null}
        </li>
      ))}
    </ul>
  )
}

function DecideProposal({ p, action, onDone }: { p: Proposal; action: "accept" | "reject"; onDone: () => void }) {
  const id = useId()
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState(false)
  const accept = action === "accept"
  const submit = async () => {
    setBusy(true)
    try {
      await api.decideProposal(p.id, action, note.trim() || undefined)
      toast.success(accept ? `Playbook amended: ${p.rule_id}` : `Proposal rejected: ${p.rule_id}`)
      setOpen(false)
      onDone()
    } catch (e) {
      toast.error("Not recorded", { description: errorMessage(e) })
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <Button variant={accept ? "default" : "outline"} className="h-9" onClick={() => setOpen(true)}>
        {accept ? <Check aria-hidden /> : <X aria-hidden />}
        {accept ? "Accept amendment" : "Reject"}
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-lg font-semibold">
              {accept ? `Amend ${p.rule_id} in the playbook?` : `Reject this proposal for ${p.rule_id}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {accept
                ? "The agent will treat clauses worded like the evidence as an accepted fallback. Deterministic red flags still apply."
                : "The rule stays as it is and this proposal is not shown again."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={id}>
              Note <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Textarea id={id} dir="auto" value={note} onChange={(e) => setNote(e.target.value)} className="min-h-16 bg-background" />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(e) => {
                e.preventDefault()
                void submit()
              }}
            >
              {busy ? <LoaderCircle className="animate-spin" aria-hidden /> : null}
              {accept ? "Amend the playbook" : "Reject proposal"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

function SignalBars({ signals, rules }: { signals: Record<string, { accepted: number; upheld: number }>; rules: PlaybookRule[] | null }) {
  const rows = Object.entries(signals)
  const max = Math.max(1, ...rows.map(([, s]) => s.accepted + s.upheld))
  return (
    <Card className="gap-4">
      <CardHeader>
        <CardTitle className="text-lg font-semibold">What legal decided, per rule</CardTitle>
        <CardDescription className="flex flex-wrap gap-x-4 gap-y-1">
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="size-2.5 rounded-sm bg-brass" /> deviation accepted
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="size-2.5 rounded-sm bg-primary" /> rule upheld
          </span>
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col gap-3">
          {rows.map(([rule, s]) => {
            const clause = rules?.find((r) => r.id === rule)?.clause_type
            return (
              <li key={rule} className="grid gap-1.5 sm:grid-cols-[12rem_minmax(0,1fr)] sm:items-center sm:gap-4">
                <span className="flex flex-col">
                  <span className="font-mono text-[0.8rem] font-medium">{rule}</span>
                  {clause ? <span className="text-xs text-muted-foreground">{clause}</span> : null}
                </span>
                <span className="flex items-center gap-3">
                  <span
                    className="flex h-2.5 flex-1 overflow-hidden rounded-sm bg-muted"
                    role="img"
                    aria-label={`${s.accepted} accepted, ${s.upheld} upheld`}
                  >
                    <span className="h-full bg-brass" style={{ width: `${(s.accepted / max) * 100}%` }} />
                    <span className="h-full bg-primary" style={{ width: `${(s.upheld / max) * 100}%` }} />
                  </span>
                  <span className="w-36 shrink-0 text-end text-xs text-muted-foreground tabular">
                    {s.accepted} accepted · {s.upheld} upheld
                  </span>
                </span>
              </li>
            )
          })}
        </ul>
      </CardContent>
    </Card>
  )
}

export function InsightsView({ rules, onChanged }: { rules: PlaybookRule[] | null; onChanged: () => void }) {
  const { data, error, refresh } = usePolled("insights", loadInsights, () => null)

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl leading-tight font-semibold">Mizan learns from your lawyers' decisions</h1>
        <p className="max-w-2xl text-[0.95rem] text-muted-foreground">
          When legal keeps accepting a deviation the agent flagged, Mizan proposes a playbook amendment for a lawyer to
          approve. Red flags and critical rules are never relaxed automatically.
        </p>
      </div>

      {!data ? (
        error ? (
          <Empty className="border bg-card">
            <EmptyHeader>
              <EmptyTitle>Insights unavailable</EmptyTitle>
              <EmptyDescription>{error}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="flex flex-col gap-4">
            <Skeleton className="h-40 w-full rounded-lg" />
            <Skeleton className="h-64 w-full rounded-lg" />
          </div>
        )
      ) : (
        <>
          {data.proposals.length === 0 && data.notes.length === 0 && data.amendments.length === 0 ? (
            <Empty className="border bg-card py-12">
              <EmptyHeader className="max-w-lg">
                <EmptyTitle className="text-lg font-semibold">Nothing to learn yet</EmptyTitle>
                <EmptyDescription className="text-[0.95rem]">
                  Every decision in the Inbox is evidence. When legal accepts the same kind of deviation at least{" "}
                  {plural(data.min_accepted, "time")}, more often than it upholds the rule, a proposed amendment appears
                  here with the quotes behind it.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : null}

          {data.proposals.length ? (
            <section className="flex flex-col gap-4" aria-label="Proposed amendments">
              <h2 className="text-xl font-semibold">Proposed amendments</h2>
              {data.proposals.map((p) => (
                <Card key={p.id} className="gap-0 p-0">
                  <div className="flex flex-col gap-1.5 border-b p-4 sm:p-5">
                    <span className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="rounded-md font-mono">
                        {p.rule_id}
                      </Badge>
                      <span className="text-sm text-muted-foreground">{p.clause_type}</span>
                    </span>
                    <p className="text-sm">{p.why}</p>
                  </div>
                  <div className="grid gap-4 p-4 sm:p-5 lg:grid-cols-2">
                    <div className="flex min-w-0 flex-col gap-3 text-sm">
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground">Current fallback</p>
                        <p>{p.current_fallback}</p>
                      </div>
                      <div className="rounded-lg border border-brass/40 bg-brass-soft/60 p-3">
                        <p className="text-xs font-semibold text-brass-ink">Proposed addition</p>
                        <p dir="auto" lang={langOf(p.proposed_addition)}>
                          {p.proposed_addition}
                        </p>
                      </div>
                      <p className="text-muted-foreground">{p.effect}</p>
                    </div>
                    <div className="flex min-w-0 flex-col gap-2">
                      <p className="text-xs font-semibold text-muted-foreground">
                        Evidence · {plural(p.evidence.length, "decision")}
                      </p>
                      <Evidence items={p.evidence} />
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 border-t bg-muted/40 px-4 py-3 sm:px-5">
                    <span className="me-1 text-xs font-medium text-muted-foreground">A lawyer decides</span>
                    <DecideProposal
                      p={p}
                      action="accept"
                      onDone={() => {
                        refresh()
                        onChanged()
                      }}
                    />
                    <DecideProposal p={p} action="reject" onDone={refresh} />
                  </div>
                </Card>
              ))}
            </section>
          ) : null}

          {data.notes.map((n) => (
            <Alert key={n.rule_id} className="border-minor/30 bg-minor-soft text-minor">
              <ShieldAlert aria-hidden />
              <AlertTitle>
                <span className="font-mono">{n.rule_id}</span>: critical rule, not relaxed
              </AlertTitle>
              <AlertDescription className="flex flex-col gap-3 text-foreground/85">
                <p>{n.text}</p>
                <Evidence items={n.evidence} />
              </AlertDescription>
            </Alert>
          ))}

          {Object.keys(data.signals).length ? <SignalBars signals={data.signals} rules={rules} /> : null}

          <Card className="gap-4">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg font-semibold">
                <BookCheck className="size-5 text-primary" aria-hidden />
                Accepted amendments
              </CardTitle>
              <CardDescription>Shown under each rule in the Playbook tab, and used by the agent on new reviews.</CardDescription>
            </CardHeader>
            <CardContent>
              {data.amendments.length ? (
                <ul className="flex flex-col gap-3">
                  {data.amendments.map((a) => (
                    <li key={a.id} className={cn("flex flex-col gap-1 rounded-lg border bg-background/60 p-3 text-sm")}>
                      <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <Badge variant="outline" className="rounded-md font-mono">
                          {a.rule_id}
                        </Badge>
                        accepted {relativeTime(a.at)} · from {plural(a.evidence_runs.length, "decision")}
                      </span>
                      <p dir="auto" lang={langOf(a.text)}>
                        {a.text}
                      </p>
                      {a.note ? <p className="text-xs text-muted-foreground">Note: {a.note}</p> : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Info className="size-4" aria-hidden /> No amendments yet.
                </p>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
