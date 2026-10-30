import {
  ArrowUpRight,
  CircleX,
  Inbox,
  UserRoundCheck,
  FileDown,
  Workflow,
  Check,
  ChevronDown,
  CircleDashed,
  ClipboardCopy,
  Gavel,
  Info,
  LoaderCircle,
  MessageSquareText,
  PenLine,
  Send,
  TriangleAlert,
} from "lucide-react"
import { cn } from "cn"
import { useState } from "react"
import { toast } from "sonner"

import { RichText } from "@/components/rich-text"
import { TwoDetectors } from "@/components/two-detectors"
import { SeverityBadge } from "@/components/tone-badges"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { exportUrl, type DecisionRecord, type Finding, type NeedsHuman, type ReviewView, type Severity, type WriteAction } from "@/lib/api"
import { byWorkflow, DECISION_LABEL, langOf, relativeTime, ROUTE_DESCRIPTION, ROUTE_LABEL, SEVERITY_ORDER } from "@/lib/format"
import { go } from "@/lib/route"
import { ROUTE_TONE, SEVERITY_TONE } from "@/lib/tones"

function SeverityLine({ counts }: { counts: Record<Severity, number> }) {
  return (
    <p className="flex flex-wrap gap-x-3 gap-y-1 text-sm tabular">
      {SEVERITY_ORDER.map((s) => (
        <span key={s} className={cn("inline-flex items-center gap-1.5", counts[s] ? SEVERITY_TONE[s].text : "text-muted-foreground")}>
          <span aria-hidden className={cn("size-2 rounded-[2px]", SEVERITY_TONE[s].dot, !counts[s] && "opacity-40")} />
          <span className="font-semibold">{counts[s]}</span> {s}
        </span>
      ))}
    </p>
  )
}

function RouteCard({ review }: { review: ReviewView }) {
  const { route, risk_score, counts, reasons } = review

  if (review.status === "error") {
    return (
      <Alert className="border-escalate/40 bg-escalate-soft text-escalate">
        <CircleX aria-hidden />
        <AlertTitle>The run failed before it could be routed</AlertTitle>
        <AlertDescription className="text-foreground/80">
          Nothing was sent or approved. The Trace tab shows the last model and tool calls and the error.
        </AlertDescription>
      </Alert>
    )
  }

  if (!route || risk_score == null || !counts) {
    if (review.status === "done") {
      return (
        <Alert className="border-negotiate/40 bg-negotiate-soft text-negotiate">
          <TriangleAlert aria-hidden />
          <AlertTitle>No valid route</AlertTitle>
          <AlertDescription className="text-foreground/80">
            The run ended without a current score: either the scoring step never ran, or a finding was recorded after
            it, which voids the score. Nothing is approved without a valid route.
          </AlertDescription>
        </Alert>
      )
    }
    return (
      <Card className="p-0">
        <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:p-6">
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            <span className="inline-flex items-center gap-2 text-xs font-medium text-brass-ink">
              <LoaderCircle className="size-3.5 animate-spin" aria-hidden /> Reviewing
            </span>
            <p className="font-heading text-2xl font-semibold">Reading clauses and recording findings…</p>
            <p className="text-sm text-muted-foreground">
              {review.findings.length > 0
                ? `${review.findings.length} finding${review.findings.length === 1 ? "" : "s"} recorded so far. The route appears once the scoring code runs.`
                : "The route appears once the scoring code runs."}
            </p>
          </div>
          <Skeleton className="h-16 w-28 shrink-0" />
        </div>
      </Card>
    )
  }

  const tone = ROUTE_TONE[route]
  return (
    <Card className="p-0">
      <div className="grid gap-6 p-5 sm:p-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
        <div className="flex min-w-0 flex-col gap-3">
          <span className="text-sm text-muted-foreground">Route, computed by the scoring code</span>
          <h2 className={cn("text-4xl leading-none font-semibold sm:text-5xl", tone.text)}>{ROUTE_LABEL[route]}</h2>
          <p className="max-w-prose text-[0.95rem] text-muted-foreground">{ROUTE_DESCRIPTION[route]}</p>
          {reasons.length > 0 ? (
            <ul className="flex flex-col gap-1.5">
              {reasons.map((r) => (
                <li key={r} className="flex items-start gap-2 text-sm">
                  <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span dir="auto">{r}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <div className="flex flex-col gap-2 border-t pt-4 md:min-w-56 md:border-t-0 md:border-s md:ps-6 md:pt-0">
          <span className="text-sm text-muted-foreground">Risk score</span>
          <span className="font-heading text-4xl leading-none font-semibold tabular">
            {risk_score}
            <span className="ms-1 text-base font-normal text-muted-foreground">/ 100</span>
          </span>
          <SeverityLine counts={counts} />
        </div>
      </div>
    </Card>
  )
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      toast.success("Redline copied to the clipboard")
      setTimeout(() => setCopied(false), 1800)
    } catch {
      toast.error("Copy failed: the browser blocked clipboard access")
    }
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon-sm" onClick={copy} aria-label={label}>
          {copied ? <Check className="text-approve" aria-hidden /> : <ClipboardCopy aria-hidden />}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{copied ? "Copied" : label}</TooltipContent>
    </Tooltip>
  )
}

function FindingCard({ f, onJump }: { f: Finding; onJump: (clauseId: string) => void }) {
  return (
    <article className={cn("rounded-lg border bg-card p-4 sm:p-5")}>
      <header className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
        <SeverityBadge severity={f.severity} />
        <span className="font-mono text-[0.8rem] font-medium">{f.rule_id}</span>
        {f.clause_type ? <span className="text-sm text-muted-foreground">{f.clause_type}</span> : null}
        <Button
          variant="outline"
          size="xs"
          className="ms-auto font-mono"
          onClick={() => onJump(f.clause_id)}
          aria-label={`Show clause ${f.clause_id} in the contract`}
        >
          {f.clause_id}
          <ArrowUpRight data-icon="inline-end" aria-hidden />
        </Button>
      </header>

      {f.quote ? (
        <blockquote
          dir="auto"
          lang={langOf(f.quote)}
          className="mt-3 font-heading text-[1.02rem] leading-relaxed text-foreground"
        >
          <mark className="rounded-sm bg-highlight px-0.5 text-foreground [box-decoration-break:clone]">{f.quote}</mark>
        </blockquote>
      ) : null}

      <p dir="auto" lang={langOf(f.issue)} className="mt-3 text-sm leading-relaxed text-foreground/90">
        {f.issue}
      </p>

      {f.redline ? (
        <div className="mt-4 rounded-lg border border-dashed border-approve/40 bg-approve-soft/50 p-3">
          <div className="mb-1 flex items-center gap-2">
            <PenLine className="size-3.5 text-approve" aria-hidden />
            <span className="text-xs font-semibold text-approve">Proposed redline</span>
            <span className="ms-auto">
              <CopyButton text={f.redline} label="Copy redline" />
            </span>
          </div>
          <p dir="auto" lang={langOf(f.redline)} className="text-sm leading-relaxed whitespace-pre-line">
            {f.redline}
          </p>
        </div>
      ) : null}

      {f.confidence != null ? (
        <p className="mt-3 text-xs text-muted-foreground tabular">
          Model confidence {Math.round(f.confidence * (f.confidence <= 1 ? 100 : 1))}%
        </p>
      ) : null}
    </article>
  )
}

function ActionItem({ a }: { a: WriteAction }) {
  const legal = a.kind === "legal"
  const Icon = legal ? Gavel : Send
  return (
    <li className="flex flex-col gap-2.5 rounded-lg border bg-background/60 p-3.5">
      <div className="flex flex-wrap items-center gap-2">
        <Icon className="size-4 text-muted-foreground" aria-hidden />
        <span className="text-sm font-semibold">{legal ? "Escalate to legal" : "Send to counterparty"}</span>
        {a.dry_run ? (
          <Badge variant="outline" className="ms-auto gap-1 rounded-md border-brass/50 bg-brass-soft text-brass-ink">
            <CircleDashed data-icon="inline-start" aria-hidden />
            Dry-run · not sent
          </Badge>
        ) : (
          <Badge variant="outline" className="ms-auto gap-1 rounded-md border-approve/40 bg-approve-soft text-approve">
            <Check data-icon="inline-start" aria-hidden />
            Sent
          </Badge>
        )}
      </div>
      <p dir="auto" lang={langOf(a.text)} className="text-sm leading-relaxed whitespace-pre-line text-foreground/90">
        {a.text}
      </p>
    </li>
  )
}

const PENDING_TEXT: Record<NeedsHuman, { title: string; body: string }> = {
  unrouted: {
    title: "Needs a full lawyer review: the agent did not finish",
    body: "The agent stopped before computing a route, so nothing is approved or sent. A lawyer reviews the whole contract in the Inbox.",
  },
  legal_review: {
    title: "Waiting for a lawyer",
    body: "Escalations are never decided by the agent. A lawyer approves, requests changes or rejects in the Inbox.",
  },
  approve_send: {
    title: "Waiting for approval to send",
    body: "The agent drafted the counterparty message but write actions need a human. Approve or discard it in the Inbox.",
  },
}

function PendingStep({ pending }: { pending: NeedsHuman | null }) {
  if (!pending) return null
  return (
    <Alert className="border-brass/50 bg-brass-soft text-brass-ink">
      <Inbox aria-hidden />
      <AlertTitle>{PENDING_TEXT[pending].title}</AlertTitle>
      <AlertDescription className="text-foreground/80">
        <p>{PENDING_TEXT[pending].body}</p>
        <Button size="sm" variant="outline" className="mt-2 bg-card" onClick={() => go({ area: "inbox" })}>
          Open the Inbox
        </Button>
      </AlertDescription>
    </Alert>
  )
}

const SENT = new Set(["send", "request_changes"])

/** Once a human has decided, the action card shows what actually happened; the agent's draft is secondary. */
function DecidedAction({ decision, actions }: { decision: DecisionRecord; actions: WriteAction[] }) {
  const sent = SENT.has(decision.decision)
  const bad = decision.decision === "reject" || decision.decision === "discard"
  const drafts = actions.filter((a) => a.text && a.text.trim() !== (decision.message ?? "").trim())
  const auto = byWorkflow(decision.by)
  const Who = auto ? Workflow : UserRoundCheck
  return (
    <div className="flex flex-col gap-3">
      <div className={cn("flex flex-col gap-2.5 rounded-lg border p-3.5", bad ? "border-escalate/30 bg-escalate-soft/50" : "border-approve/30 bg-approve-soft/60")}>
        <div className="flex flex-wrap items-center gap-2">
          <Who className={cn("size-4", bad ? "text-escalate" : "text-approve")} aria-hidden />
          <span className="text-sm font-semibold">{DECISION_LABEL[decision.decision]}</span>
          {sent ? (
            <Badge variant="outline" className="ms-auto gap-1 rounded-md border-approve/40 bg-approve-soft text-approve">
              <Check data-icon="inline-start" aria-hidden />
              Sent
            </Badge>
          ) : null}
        </div>
        <p className="text-xs text-muted-foreground">
          {auto
            ? "Sent automatically by the workflow (auto-send policy), composed from the recorded redlines"
            : sent
              ? "Sent by a human reviewer"
              : "Decided by a human reviewer"}{" "}
          · {relativeTime(decision.at)}
        </p>
        {decision.message ? (
          <p dir="auto" lang={langOf(decision.message)} className="text-sm leading-relaxed whitespace-pre-line text-foreground/90">
            {decision.message}
          </p>
        ) : null}
        {decision.note ? (
          <p dir="auto" lang={langOf(decision.note)} className="border-t pt-2 text-sm">
            <span className="font-medium text-muted-foreground">Note: </span>
            {decision.note}
          </p>
        ) : null}
      </div>
      {drafts.length ? (
        <Collapsible>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="group w-fit text-muted-foreground">
              {drafts.length === 1 ? "Agent's draft" : `Agent's drafts (${drafts.length})`}
              <ChevronDown className="transition-transform group-data-[state=open]:rotate-180" data-icon="inline-end" aria-hidden />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2 flex flex-col gap-2">
            {drafts.map((a, i) => (
              <div key={i} className="rounded-lg border border-dashed p-3">
                <p className="mb-1 text-xs font-semibold text-muted-foreground">
                  {a.kind === "legal" ? "Agent's question for legal" : "Agent's draft to the counterparty"}
                </p>
                <p dir="auto" lang={langOf(a.text)} className="text-sm leading-relaxed whitespace-pre-line text-muted-foreground">
                  {a.text}
                </p>
              </div>
            ))}
          </CollapsibleContent>
        </Collapsible>
      ) : null}
    </div>
  )
}

function SectionSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-28 w-full rounded-lg" />
      ))}
    </div>
  )
}

export function ReviewTabSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-52 w-full rounded-lg" />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <SectionSkeleton />
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    </div>
  )
}

function Documents({ runId }: { runId: string }) {
  return (
    <Card className="gap-3">
      <CardHeader>
        <CardTitle className="font-heading text-lg font-semibold">Documents</CardTitle>
        <CardDescription>PDFs for the lawyer's file and the counterparty.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <Button asChild variant="outline" className="h-auto justify-start py-2 text-start whitespace-normal">
          <a href={exportUrl(runId, "redline.pdf")} download>
            <FileDown aria-hidden />
            Download redline (PDF)
          </a>
        </Button>
        <Button asChild variant="outline" className="h-auto justify-start py-2 text-start whitespace-normal">
          <a href={exportUrl(runId, "memo.pdf")} download>
            <FileDown aria-hidden />
            Download memo (PDF)
          </a>
        </Button>
      </CardContent>
    </Card>
  )
}

export function ReviewTab({
  review,
  onJump,
  runId,
}: {
  review: ReviewView
  onJump: (clauseId: string) => void
  runId: string
}) {
  const running = review.status === "running" || review.status === "starting"
  return (
    <div className="flex flex-col gap-6">
      <RouteCard review={review} />
      <TwoDetectors review={review} onJump={onJump} />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <section aria-labelledby="findings-h" className="flex min-w-0 flex-col gap-3">
          <div className="flex items-baseline gap-3">
            <h3 id="findings-h" className="text-xl font-semibold">
              Findings
            </h3>
            <span className="text-sm text-muted-foreground tabular">{review.findings.length}</span>
            <span className="ms-auto hidden text-xs text-muted-foreground sm:inline">
              Every finding quotes the clause verbatim
            </span>
          </div>
          {review.findings.length > 0 ? (
            <div className="flex flex-col gap-3">
              {review.findings.map((f) => (
                <FindingCard key={`${f.clause_id}-${f.rule_id}`} f={f} onJump={onJump} />
              ))}
              {running ? <Skeleton className="h-24 w-full rounded-lg" /> : null}
            </div>
          ) : running ? (
            <SectionSkeleton rows={2} />
          ) : (
            <Empty className="flex-none border bg-card py-10">
              <EmptyHeader>
                <EmptyTitle>No findings</EmptyTitle>
                <EmptyDescription>
                  {review.route
                    ? "Every clause the agent mapped meets the playbook."
                    : "The agent recorded no findings in this run."}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </section>

        <aside className="flex min-w-0 flex-col gap-6">
          <PendingStep pending={review.pending} />
          <Card>
            <CardHeader>
              <CardTitle className="font-heading text-lg font-semibold">
                {review.decision ? "Action taken" : "Recommended action"}
              </CardTitle>
              <CardDescription>
                {review.decision
                  ? byWorkflow(review.decision.by)
                    ? "The model did not send its redlines, so the batch's auto-send policy did."
                    : "A human reviewed the agent's proposal and decided."
                  : review.actions.some((a) => a.dry_run)
                    ? "Write actions stay dry-run until a human approves them."
                    : review.actions.length
                      ? "What the agent did at the end of the review."
                      : "What the agent proposes to do next."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {review.decision ? (
                <DecidedAction decision={review.decision} actions={review.actions} />
              ) : review.actions.length > 0 ? (
                <ul className="flex flex-col gap-3">
                  {review.actions.map((a, i) => (
                    <ActionItem key={i} a={a} />
                  ))}
                </ul>
              ) : running ? (
                <Skeleton className="h-24 w-full" />
              ) : (
                <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
                  {review.route === "approve"
                    ? "No outbound action needed: the contract can be signed as is."
                    : "The agent did not prepare an outbound action."}
                </p>
              )}
            </CardContent>
          </Card>

          {review.status === "done" && review.doc_id ? <Documents runId={runId} /> : null}

          <Card>
            <CardHeader>
              <CardTitle className="font-heading text-lg font-semibold">Review memo</CardTitle>
            </CardHeader>
            <CardContent>
              {review.memo ? (
                <RichText text={review.memo} className="text-sm leading-relaxed text-foreground/90" />
              ) : running ? (
                <div className="flex flex-col gap-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-11/12" />
                  <Skeleton className="h-4 w-4/5" />
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No memo was rendered for this run.</p>
              )}
            </CardContent>
          </Card>

          {review.final_text && !running ? (
            <Collapsible className="rounded-lg border bg-card">
              <CollapsibleTrigger asChild>
                <Button variant="ghost" className="group h-auto w-full justify-start gap-2 rounded-lg px-4 py-3 text-start">
                  <MessageSquareText aria-hidden />
                  <span className="font-medium">Agent’s closing message</span>
                  <ChevronDown className="ms-auto text-muted-foreground transition-transform group-data-[state=open]:rotate-180" aria-hidden />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="border-t px-4 py-3">
                <RichText text={review.final_text} className="text-sm leading-relaxed text-foreground/90" />
              </CollapsibleContent>
            </Collapsible>
          ) : null}
        </aside>
      </div>
    </div>
  )
}
