import { ArrowUpRight, Check, Clapperboard, Gavel, Info, LoaderCircle, PenLine, Send, Trash2, X } from "lucide-react"
import { cn } from "cn"
import { useId, useRef, useState } from "react"
import { toast } from "sonner"

import { RouteBadge, SeverityBadge } from "@/components/tone-badges"
import { ARRIVE, useArrivals } from "@/hooks/use-arrivals"
import { RedFlagSummary } from "@/components/two-detectors"
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
import { Card } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { api, errorMessage, type ContractSummary, type DecisionKind, type InboxItem, type RunSummary } from "@/lib/api"
import { composedFromRedlines, contractTitle, DECISION_LABEL, isEvalRun, langOf, relativeTime } from "@/lib/format"
import { go } from "@/lib/route"

function ReplayBadge() {
  return (
    <Badge variant="outline" className="gap-1 rounded-md border-dashed border-brass/60 font-normal text-brass-ink">
      <Clapperboard data-icon="inline-start" aria-hidden />
      Replay
    </Badge>
  )
}

interface OptionSpec {
  label: string
  icon: typeof Check
  /** confirm: a yes/no AlertDialog. compose: a Dialog with an editable message. */
  mode: "confirm" | "compose"
  variant: "default" | "outline" | "destructive"
  title: string
  body: string
  submit: string
}

const OPTIONS: Record<DecisionKind, OptionSpec> = {
  approve_contract: {
    label: "Approve contract",
    icon: Check,
    mode: "confirm",
    variant: "default",
    title: "Approve this contract as it is?",
    body: "Your decision is recorded on the run. Nothing is sent to the counterparty.",
    submit: "Approve contract",
  },
  request_changes: {
    label: "Request changes",
    icon: PenLine,
    mode: "compose",
    variant: "outline",
    title: "Request changes from the counterparty",
    body: "Leave the message empty and Mizan writes it from the playbook redlines of the critical and major findings. Or write your own.",
    submit: "Send change request",
  },
  reject: {
    label: "Reject",
    icon: X,
    mode: "confirm",
    variant: "destructive",
    title: "Reject this contract?",
    body: "Your decision is recorded on the run. Nothing is sent to the counterparty.",
    submit: "Reject contract",
  },
  send: {
    label: "Review and send",
    icon: Send,
    mode: "compose",
    variant: "default",
    title: "Send the redlines to the counterparty",
    body: "This is the agent's draft. Edit it if you need to; it is sent as you leave it.",
    submit: "Send to counterparty",
  },
  discard: {
    label: "Discard draft",
    icon: Trash2,
    mode: "confirm",
    variant: "outline",
    title: "Discard the drafted message?",
    body: "Nothing is sent. The review stays on record.",
    submit: "Discard draft",
  },
}

function DecisionControl({
  item,
  option,
  docTitle,
  onDone,
}: {
  item: InboxItem
  option: DecisionKind
  docTitle: string
  onDone: (d: DecisionKind) => void
}) {
  const spec = OPTIONS[option]
  const id = useId()
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState("")
  const [message, setMessage] = useState(option === "send" ? item.agent_text : "")
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    setBusy(true)
    try {
      await api.decide(item.run_id, {
        decision: option,
        note: note.trim() || undefined,
        message: spec.mode === "compose" && message.trim() ? message.trim() : undefined,
      })
      toast.success(`${DECISION_LABEL[option]}: ${item.doc_id}`, {
        description: spec.mode === "compose" ? "The message is in the run's outbox." : "Recorded on the run.",
      })
      setOpen(false)
      onDone(option)
    } catch (e) {
      toast.error("Decision not recorded", { description: errorMessage(e) })
    } finally {
      setBusy(false)
    }
  }

  const Icon = spec.icon
  const trigger = (
    <Button variant={spec.variant} onClick={() => setOpen(true)} className="h-9">
      <Icon aria-hidden />
      {spec.label}
    </Button>
  )
  const noteField = (
    <div className="flex flex-col gap-1.5 text-start">
      <Label htmlFor={`${id}-note`}>
        Note for the record <span className="font-normal text-muted-foreground">(optional)</span>
      </Label>
      <Input id={`${id}-note`} dir="auto" value={note} onChange={(e) => setNote(e.target.value)} className="bg-background" />
    </div>
  )

  if (spec.mode === "confirm") {
    return (
      <>
        {trigger}
        <AlertDialog open={open} onOpenChange={setOpen}>
          <AlertDialogContent className="sm:max-w-md">
            <AlertDialogHeader>
              <AlertDialogTitle className="flex flex-wrap items-center gap-2 font-heading text-lg font-semibold">
                {spec.title}
                {item.replay_of ? <ReplayBadge /> : null}
              </AlertDialogTitle>
              <AlertDialogDescription>
                <span dir="auto" className="font-medium text-foreground">
                  {docTitle}
                </span>
                . {spec.body}
                {item.replay_of ? " This is a replay: the decision is for demonstration and is not used by Insights." : ""}
              </AlertDialogDescription>
            </AlertDialogHeader>
            {noteField}
            <AlertDialogFooter>
              <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                variant={spec.variant === "destructive" ? "destructive" : "default"}
                disabled={busy}
                onClick={(e) => {
                  e.preventDefault()
                  void submit()
                }}
              >
                {busy ? <LoaderCircle className="animate-spin" aria-hidden /> : null}
                {spec.submit}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </>
    )
  }

  return (
    <>
      {trigger}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[92dvh] gap-4 overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex flex-wrap items-center gap-2 font-heading text-lg font-semibold">
              {spec.title}
              {item.replay_of ? <ReplayBadge /> : null}
            </DialogTitle>
            <DialogDescription>
              {spec.body}
              {item.replay_of ? " This is a replay: the decision is for demonstration and is not used by Insights." : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-msg`}>Message to the counterparty</Label>
            <Textarea
              id={`${id}-msg`}
              dir="auto"
              lang={message ? langOf(message) : undefined}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={option === "request_changes" ? "Empty: Mizan composes the request from the redlines." : undefined}
              className="max-h-[45dvh] min-h-44 bg-background text-sm leading-relaxed [overflow-wrap:anywhere]"
            />
          </div>
          {noteField}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={() => void submit()} disabled={busy || (option === "send" && !message.trim())}>
              {busy ? <LoaderCircle className="animate-spin" aria-hidden /> : <Send aria-hidden />}
              {spec.submit}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function InboxCard({
  item,
  contract,
  onDone,
}: {
  item: InboxItem
  contract: ContractSummary | null
  onDone: (d: DecisionKind) => void
}) {
  const legal = item.kind !== "approve_send"
  const unrouted = item.kind === "unrouted"
  const title = contract ? contractTitle(contract.title).primary : (item.doc_id ?? "A run that did not load a contract")
  const findings = item.findings.slice(0, 3)
  return (
    <Card className="gap-0 p-0">
      <div className="flex flex-col gap-2 border-b p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="gap-1 rounded-md border-brass/50 bg-brass-soft text-brass-ink">
            {legal ? <Gavel data-icon="inline-start" aria-hidden /> : <Send data-icon="inline-start" aria-hidden />}
            {unrouted ? "Full lawyer review" : legal ? "Lawyer review" : "Approve send"}
          </Badge>
          {item.route ? <RouteBadge route={item.route} /> : null}
          {item.replay_of ? <ReplayBadge /> : null}
          <span className="font-mono text-xs text-muted-foreground">{item.doc_id}</span>
          {item.risk_score != null ? (
            <span className="text-xs text-muted-foreground tabular">· risk {item.risk_score}/100</span>
          ) : null}
          <span className="ms-auto text-xs text-muted-foreground">{relativeTime(item.created)}</span>
        </div>
        <div className="flex flex-col items-start gap-1 sm:flex-row sm:gap-3">
          <h2 dir="auto" lang={langOf(title)} className="w-full min-w-0 flex-1 text-xl leading-snug font-semibold">
            {title}
          </h2>
          <Button
            variant="ghost"
            size="sm"
            className="-ms-2 sm:ms-0"
            onClick={() => go({ area: "review", runId: item.run_id })}
          >
            Full review
            <ArrowUpRight data-icon="inline-end" aria-hidden />
          </Button>
        </div>
      </div>

      <div className="grid gap-5 p-4 sm:p-5 lg:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-4">
          {item.reasons.length ? (
            <div className="flex flex-col gap-1.5">
              <h3 className="font-sans text-xs font-semibold text-muted-foreground">
                Why the agent stopped
              </h3>
              <ul className="flex flex-col gap-1">
                {item.reasons.map((r) => (
                  <li key={r} className="flex items-start gap-2 text-sm">
                    <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                    <span dir="auto">{r}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <RedFlagSummary flags={item.tripwires ?? []} />
          {findings.length ? (
            <div className="flex flex-col gap-2">
              <h3 className="font-sans text-xs font-semibold text-muted-foreground">
                Key findings {item.findings.length > 3 ? `(3 of ${item.findings.length})` : null}
              </h3>
              <ul className="flex flex-col gap-2">
                {findings.map((f) => (
                  <li key={`${f.clause_id}-${f.rule_id}`} className="flex flex-col gap-1 rounded-lg border bg-background/60 p-2.5">
                    <span className="flex flex-wrap items-center gap-2">
                      <SeverityBadge severity={f.severity} />
                      <span className="font-mono text-[0.75rem] font-medium">{f.rule_id}</span>
                      <span className="font-mono text-xs text-muted-foreground">{f.clause_id}</span>
                    </span>
                    <span
                      dir="auto"
                      lang={langOf(f.quote)}
                      className="line-clamp-2 font-heading text-[0.95rem] text-foreground/90"
                    >
                      {f.quote}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No findings were recorded; see the reason above.</p>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-1.5">
          <h3 className="font-sans text-xs font-semibold text-muted-foreground">
            {unrouted
              ? "The agent did not finish"
              : legal
              ? "The agent's question for legal"
              : composedFromRedlines(item.agent_text)
                ? "Drafted from the recorded redlines"
                : "Drafted message to the counterparty"}
          </h3>
          <p
            dir="auto"
            lang={item.agent_text ? langOf(item.agent_text) : undefined}
            className="rounded-lg border bg-background/60 p-3 text-sm leading-relaxed whitespace-pre-line"
          >
            {item.agent_text ||
              (unrouted
                ? "No route was computed and no question was prepared: review the whole contract."
                : "The agent did not write a message.")}
          </p>
        </div>
      </div>

      {item.replay_of ? (
        <p className="border-t px-4 py-2 text-xs text-muted-foreground sm:px-5">
          Replay of a recorded run: decisions here are for demonstration and are not used by Insights.
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2 border-t bg-muted/40 px-4 py-3 sm:px-5">
        <span className="me-1 text-xs font-medium text-muted-foreground">Your decision</span>
        {item.options.map((o) => (
          <DecisionControl key={o} item={item} option={o} docTitle={title} onDone={onDone} />
        ))}
      </div>
    </Card>
  )
}

export function InboxView({
  items,
  error,
  contracts,
  runs,
  onDecided,
}: {
  items: InboxItem[] | null
  error: string | null
  contracts: ContractSummary[] | null
  runs: RunSummary[] | null
  onDecided: () => void
}) {
  // Hide a decided item at once; the next poll confirms it has left the inbox.
  const [decided, setDecided] = useState<Set<string>>(new Set())
  const [leaving, setLeaving] = useState<Set<string>>(new Set())
  // A decided card fades out first, then the list closes up and the inbox refreshes. The timer is a
  // fallback in case the animation-end event never fires.
  const closed = useRef<Set<string>>(new Set())
  const finish = (id: string) => {
    if (closed.current.has(id)) return
    closed.current.add(id)
    setDecided((s) => new Set(s).add(id))
    onDecided()
  }
  const leave = (id: string) => {
    setLeaving((s) => new Set(s).add(id))
    setTimeout(() => finish(id), 400)
  }
  const visible = items?.filter((i) => !decided.has(i.run_id)) ?? null
  const isNew = useArrivals(visible?.map((i) => i.run_id))
  const legal = visible?.filter((i) => i.kind !== "approve_send").length ?? 0
  const sends = (visible?.length ?? 0) - legal
  // Finished non-eval runs that reached a route and need nobody.
  const finished =
    runs?.filter((r) => !isEvalRun(r.run_id) && r.status === "done" && r.route && !r.needs_human).length ?? 0

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl leading-tight font-semibold">Legal inbox</h1>
        <p className="max-w-2xl text-[0.95rem] text-muted-foreground">
          Escalations for a lawyer and drafted messages that need approval before they are sent.
        </p>
        {visible && visible.length > 0 ? (
          <div className="flex flex-wrap gap-2 pt-1">
            <Badge variant="outline" className="gap-1 rounded-md">
              <Gavel data-icon="inline-start" aria-hidden />
              {legal} for a lawyer
            </Badge>
            <Badge variant="outline" className="gap-1 rounded-md">
              <Send data-icon="inline-start" aria-hidden />
              {sends} to approve
            </Badge>
          </div>
        ) : null}
      </div>

      {!visible ? (
        error ? (
          <Empty className="border bg-card">
            <EmptyHeader>
              <EmptyTitle>Inbox unavailable</EmptyTitle>
              <EmptyDescription>{error}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="flex flex-col gap-4">
            <Skeleton className="h-72 w-full rounded-lg" />
            <Skeleton className="h-72 w-full rounded-lg" />
          </div>
        )
      ) : visible.length === 0 ? (
        <div className="flex flex-col gap-1 rounded-lg border bg-card px-6 py-6">
          <p className="text-lg font-semibold">Nothing is waiting for a decision.</p>
          <p className="text-sm text-muted-foreground">
            {finished > 0
              ? `${finished} recent review${finished === 1 ? "" : "s"} finished without needing anyone.`
              : "Escalations and drafts that need approval appear here."}
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-5">
          {visible.map((it) => (
            <li
              key={it.run_id}
              className={cn(
                leaving.has(it.run_id)
                  ? "pointer-events-none animate-out fade-out-0 zoom-out-[0.98] duration-200 ease-in fill-mode-forwards"
                  : isNew(it.run_id) && ARRIVE
              )}
              onAnimationEnd={(e) => {
                if (e.target === e.currentTarget && leaving.has(it.run_id)) finish(it.run_id)
              }}
            >
              <InboxCard
                item={it}
                contract={contracts?.find((c) => c.doc_id === it.doc_id) ?? null}
                onDone={() => leave(it.run_id)}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
