import {
  ChevronDown,
  CircleCheck,
  CircleDashed,
  CircleX,
  FlaskConical,
  RotateCcw,
  Server,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react"
import { cn } from "cn"
import type { ReactNode } from "react"

import { RoiCalculator } from "@/components/roi-calculator"
import { RouteBadge } from "@/components/tone-badges"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useResource } from "@/hooks/use-api"
import { api, type ContractSummary, type EvalCase, type EvalModel } from "@/lib/api"
import { percent, plural, seconds, usd } from "@/lib/format"

const loadEvals = () => api.evals()

/** Measured outside the API (pattern hits vs labelled issues); kept verbatim wherever red flags are discussed. */
const RED_FLAG_LIMIT =
  "Red-flag patterns catch known wording (12/12 on the suite they were written against) but only 1 of 13 issues on the blind held-out set: on new contracts the model is the real detector."

const GUARANTEES: { text: string; note?: string }[] = [
  { text: "A critical finding never auto-approves: the route is computed by code, not by the model." },
  { text: "Approval requires every page read, every clause typed, and liability and governing-law clauses present." },
  { text: "Every finding must quote the contract verbatim; a quote that is not in the clause is rejected." },
  {
    text: "Instructions written inside a contract, once a pattern or the model detects them, force an escalation instead of being followed.",
  },
  {
    text: "Deterministic red-flag checks (Arabic + English) run independently of the model: when one fires, a critical flag always escalates and the others must be recorded or explicitly cleared with evidence.",
    note: RED_FLAG_LIMIT,
  },
  { text: "Messages to a counterparty or to legal are dry-run until a human approves them." },
]

// --- derived facts (all from the saved cases, nothing hard-coded) ---------------------------------

/** How a case ended, worst first: a risky contract approved is worse than one never routed, worse than a plain fail. */
type Outcome = "false-approve" | "unrouted" | "fail" | "pass"

function outcome(c: EvalCase): Outcome {
  const risky = c.expected_route !== null && c.expected_route !== "approve"
  if (risky && c.got_route === "approve") return "false-approve"
  if (risky && c.got_route === null) return "unrouted"
  return c.passed ? "pass" : "fail"
}

interface Safety {
  risky: number
  approved: number
  unrouted: number
}

function safety(m: EvalModel): Safety {
  const risky = m.cases.filter((c) => c.expected_route !== null && c.expected_route !== "approve")
  return {
    risky: risky.length,
    approved: risky.filter((c) => c.got_route === "approve").length,
    unrouted: risky.filter((c) => c.got_route === null).length,
  }
}

const notSafe = (s: Safety) => s.approved + s.unrouted

/** A model served locally (OpenAI-compatible server such as Ollama) has no API price. */
function isLocal(m: EvalModel) {
  return m.summary.provider === "openai_compat" || (m.summary.cost_usd === 0 && !m.model.startsWith("claude"))
}

function modelName(id: string) {
  const claude = /^claude-([a-z]+)-(\d+)-(\d+)$/.exec(id)
  if (claude) return `Claude ${claude[1][0].toUpperCase()}${claude[1].slice(1)} ${claude[2]}.${claude[3]}`
  const tagged = /^([\w.-]+):(\d+(?:\.\d+)?)b$/i.exec(id)
  if (tagged) return `${tagged[1]} ${tagged[2]}B`
  return id
}

/** One eval entry = model + variant (the same model can be measured before and after a change). */
function keyOf(m: EvalModel) {
  return `${m.model}|${m.variant ?? ""}|${m.suite ?? "main"}`
}

/** null means the current agent, which runs the red-flag checks. */
function variantText(m: EvalModel) {
  return m.variant ?? "with red-flag checks"
}

function VariantLabel({ m }: { m: EvalModel }) {
  return (
    <span
      className={cn(
        "rounded border px-1.5 py-px text-[0.7rem] font-normal whitespace-nowrap",
        m.variant ? "border-dashed text-muted-foreground" : "border-primary/30 text-primary"
      )}
    >
      {variantText(m)}
    </span>
  )
}

function money(m: EvalModel, v: number | null | undefined) {
  return isLocal(m) ? "local, no API cost" : usd(v)
}

function notSafeText(s: Safety) {
  const parts = [s.approved ? `${s.approved} approved` : null, s.unrouted ? `${s.unrouted} left unrouted` : null]
  return `${notSafe(s)} of ${s.risky} not safely routed (${parts.filter(Boolean).join(", ")})`
}

// --- pieces ----------------------------------------------------------------------------------------

function Regraded({ m }: { m: EvalModel }) {
  const from = m.summary.rescored_from
  if (!from) return null
  return (
    <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
      <RotateCcw className="mt-0.5 size-3 shrink-0" aria-hidden />
      Re-graded against corrected labels from the same traces ({from}); no new model calls.
    </p>
  )
}

function ModelCard({ m }: { m: EvalModel }) {
  const s = m.summary
  const sf = safety(m)
  const bad = notSafe(sf) > 0
  return (
    <Card className={cn("gap-4", bad && "ring-escalate/40")}>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          <span className="font-heading text-lg font-semibold">{modelName(m.model)}</span>
          <VariantLabel m={m} />
          {isLocal(m) ? (
            <Badge variant="outline" className="gap-1 rounded-md">
              <Server data-icon="inline-start" aria-hidden />
              On-premise
            </Badge>
          ) : null}
          {bad ? (
            <Badge variant="outline" className="gap-1 rounded-md border-escalate/40 bg-escalate-soft text-escalate">
              <ShieldAlert data-icon="inline-start" aria-hidden />
              Not safe unattended
            </Badge>
          ) : null}
        </CardTitle>
        <CardDescription className="flex flex-col gap-1">
          <span>
            <span className="font-mono">{m.model}</span> · {s.cases} contracts · saved{" "}
            {new Date(m.date * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
          </span>
          <Regraded m={m} />
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-start">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm text-muted-foreground">False auto-approve</span>
          <span className={cn("font-heading text-4xl leading-none font-semibold tabular", bad ? "text-escalate" : "text-approve")}>
            {s.false_auto_approve}
          </span>
          <span className="text-xs text-muted-foreground tabular">
            {bad ? `${sf.approved} approved, ${sf.unrouted} unrouted` : "see the headline"}
          </span>
        </div>
        <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1.5 text-sm sm:border-s sm:ps-5">
          <dt className="text-muted-foreground">Pass rate</dt>
          <dd className="text-end tabular">
            {percent(s.pass_rate)}
            {s.passed != null ? <span className="text-muted-foreground"> ({s.passed}/{s.cases})</span> : null}
          </dd>
          <dt className="text-muted-foreground">Route accuracy</dt>
          <dd className="text-end tabular">{percent(s.route_accuracy)}</dd>
          <dt className="text-muted-foreground">Finding recall / precision</dt>
          <dd className="text-end tabular">
            {percent(s.recall)} / {percent(s.precision)}
          </dd>
          <dt className="text-muted-foreground">Latency p50 / p95</dt>
          <dd className="text-end tabular">
            {seconds(s.latency_p50_s)} / {seconds(s.latency_p95_s)}
          </dd>
          <dt className="text-muted-foreground">Cost per contract</dt>
          <dd className="text-end tabular">{isLocal(m) ? "local, no API cost" : usd(s.cases ? s.cost_usd / s.cases : null)}</dd>
        </dl>
      </CardContent>
    </Card>
  )
}

/** The headline is the first entry (the API orders the current configuration first); the rest follow as lines. */
function Headline({ models }: { models: EvalModel[] }) {
  const [lead, ...rest] = models
  const sf = safety(lead)
  const bad = notSafe(sf)
  const current = lead.variant === null
  return (
    <Card className="gap-6 p-6 sm:p-8">
      <span className="flex items-center gap-2 text-xs font-medium text-brass-ink">
        <ShieldCheck className="size-4" aria-hidden />
        {current ? "The configuration the app runs today" : "Measured on saved eval runs"}
      </span>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-6">
        <span
          className={cn(
            "font-heading text-7xl leading-none font-semibold tabular sm:text-8xl",
            bad ? "text-escalate" : "text-approve"
          )}
        >
          {bad}
        </span>
        <div className="flex max-w-3xl flex-col gap-1.5 pb-1">
          <h1 className="text-2xl leading-snug font-semibold text-balance sm:text-3xl">
            risky contracts {bad ? "not safely routed" : "auto-approved"} by {modelName(lead.model)} {variantText(lead)} (
            {plural(lead.summary.cases, "contract")})
          </h1>
          <p className="text-sm text-muted-foreground">
            {bad
              ? `${notSafeText(sf)}.`
              : `All ${sf.risky} contracts labelled negotiate or escalate went to negotiation or to a lawyer (false auto-approve ${lead.summary.false_auto_approve}).`}
          </p>
        </div>
      </div>
      {rest.length ? (
        <ul className="flex flex-col divide-y rounded-lg border bg-background/60">
          {rest.map((m) => {
            const r = safety(m)
            const n = notSafe(r)
            return (
              <li key={keyOf(m)} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
                <span className={cn("w-12 font-mono font-semibold tabular", n ? "text-escalate" : "text-approve")}>
                  {n}/{r.risky}
                </span>
                <span className="font-medium">{modelName(m.model)}</span>
                <VariantLabel m={m} />
                {isLocal(m) ? <span className="text-xs text-muted-foreground">local</span> : null}
                <span className={cn("text-xs sm:ms-auto", n ? "text-escalate" : "text-muted-foreground")}>
                  {n ? `${notSafeText(r)} · not safe for unattended use` : ""}
                </span>
              </li>
            )
          })}
        </ul>
      ) : null}
    </Card>
  )
}

function SovereignNote({ variants, heldOut }: { variants: EvalModel[]; heldOut: EvalModel[] }) {
  // The current agent (variant null) is the one described; earlier variants give the before/after.
  const m = variants.find((v) => v.variant === null) ?? variants[0]
  // Only earlier variants that approved more than the current one make a before/after worth showing.
  const before = variants.filter((v) => v !== m && safety(v).approved > safety(m).approved)
  const sf = safety(m)
  const s = m.summary
  return (
    <Card className="gap-3 ring-brass/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-heading text-lg font-semibold">
          <Server className="size-5 text-brass-ink" aria-hidden />
          Sovereign mode (on-premise model)
        </CardTitle>
        <CardDescription>
          {modelName(m.model)}, served on this machine through an OpenAI-compatible local server.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex max-w-[76ch] flex-col gap-4 text-sm leading-relaxed">
        {before.map((b) => {
          const sb = safety(b)
          return (
            <div
              key={keyOf(b)}
              className="flex flex-col gap-1 rounded-lg border border-primary/25 bg-primary/5 p-3 sm:flex-row sm:items-center sm:gap-4"
            >
              <span className="shrink-0 font-heading text-2xl font-semibold whitespace-nowrap text-primary tabular">
                {sb.approved} → {sf.approved}
              </span>
              <p>
                On the main suite, red-flag checks took <span className="font-mono">{m.model}</span> from{" "}
                {plural(sb.approved, "wrongly approved contract")} to {sf.approved} ({variantText(b)} vs {variantText(m)}).
                Unrouted risky contracts went from {sb.unrouted} to {sf.unrouted}. That suite is the one the patterns were
                written against.
              </p>
            </div>
          )
        })}
        {heldOut.map((h) => {
          const sh = safety(h)
          return (
            <div
              key={keyOf(h)}
              className="flex flex-col gap-1 rounded-lg border border-escalate/40 bg-escalate-soft p-3 sm:flex-row sm:items-center sm:gap-4"
            >
              <span className="shrink-0 font-heading text-2xl font-semibold whitespace-nowrap text-escalate tabular">
                {sh.approved} approved
              </span>
              <p>
                On the blind held-out set ({variantText(h)}) it wrongly approved {plural(sh.approved, "risky contract")}{" "}
                and left {sh.unrouted} unrouted ({notSafe(sh)} of {sh.risky} not safely routed), finding{" "}
                {percent(h.summary.recall)} of the labelled issues. The patterns did not catch what the model missed.
              </p>
            </div>
          )
        })}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-approve">What you gain</span>
            <p>Contract text never leaves the machine, and there is no API cost per contract.</p>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-escalate">What it costs</span>
            <p>
              On the main suite ({variantText(m)}), it found {percent(s.recall)} of the labelled issues. Of the {sf.risky} contracts that needed negotiation or a lawyer, it approved {sf.approved} and left{" "}
              {sf.unrouted} unrouted, with a median of {seconds(s.latency_p50_s)} per contract. The routing code blocks the
              critical issues it records or the patterns catch, not the ones both miss.
            </p>
            <p className="font-medium">
              Unattended use needs a strong model; on-premise, a lawyer must review every contract.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function Comparison({ models }: { models: EvalModel[] }) {
  const rows: [string, (m: EvalModel) => ReactNode][] = [
    [
      "False auto-approve",
      (m) => (
        <span className={notSafe(safety(m)) ? "font-semibold text-escalate" : "text-approve"}>
          {m.summary.false_auto_approve}
        </span>
      ),
    ],
    ["Pass rate", (m) => percent(m.summary.pass_rate)],
    ["Route accuracy", (m) => percent(m.summary.route_accuracy)],
    ["Finding recall", (m) => percent(m.summary.recall)],
    ["Finding precision", (m) => percent(m.summary.precision)],
    ["Latency p50 / p95", (m) => `${seconds(m.summary.latency_p50_s)} / ${seconds(m.summary.latency_p95_s)}`],
    ["Cost per contract", (m) => money(m, m.summary.cases ? m.summary.cost_usd / m.summary.cases : null)],
    ["Cost per passed contract", (m) => money(m, m.summary.cost_per_pass_usd)],
    ["Contracts in the run", (m) => String(m.summary.cases)],
  ]
  return (
    <Card className="gap-0 p-0">
      <CardHeader className="border-b py-4">
        <CardTitle className="font-heading text-lg font-semibold">Model comparison</CardTitle>
      </CardHeader>
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50 hover:bg-muted/50">
            <TableHead className="ps-4">Metric</TableHead>
            {models.map((m) => (
              <TableHead key={keyOf(m)} className="pe-4 text-end align-top">
                <span className="flex flex-col items-end gap-1 py-1">
                  {modelName(m.model)}
                  <VariantLabel m={m} />
                </span>
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map(([label, f]) => (
            <TableRow key={label}>
              <TableCell className="ps-4 text-muted-foreground">{label}</TableCell>
              {models.map((m) => (
                <TableCell key={keyOf(m)} className="pe-4 text-end font-mono tabular">
                  {f(m)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  )
}

function CaseResult({ m, id }: { m: EvalModel; id: string }) {
  const c = m.cases.find((x) => x.id === id)
  if (!c) return <span className="text-xs text-muted-foreground">not run</span>
  const o = outcome(c)
  const cost = isLocal(m) ? "local" : usd(c.cost_usd)
  if (o === "false-approve") {
    return (
      <span className="inline-flex flex-wrap items-center gap-1.5 rounded-md border border-escalate/50 bg-escalate-soft px-1.5 py-1">
        <ShieldAlert className="size-4 shrink-0 text-escalate" aria-hidden />
        <span className="text-xs font-semibold text-escalate">Approved, should not have been</span>
        <span className="font-mono text-xs text-muted-foreground tabular">{cost}</span>
      </span>
    )
  }
  if (o === "unrouted") {
    return (
      <span className="inline-flex flex-wrap items-center gap-1.5 rounded-md border border-dashed border-escalate/50 px-1.5 py-1">
        <CircleDashed className="size-4 shrink-0 text-escalate" aria-hidden />
        <span className="text-xs font-semibold text-escalate">Never routed</span>
        <span className="font-mono text-xs text-muted-foreground tabular">{cost}</span>
      </span>
    )
  }
  return (
    <span className="flex items-center gap-2">
      {o === "pass" ? (
        <CircleCheck className="size-4 shrink-0 text-approve" aria-label="passed" />
      ) : (
        <CircleX className="size-4 shrink-0 text-escalate" aria-label="failed" />
      )}
      {c.got_route ? (
        <RouteBadge route={c.got_route} />
      ) : (
        <Badge variant="outline" className="rounded-md text-muted-foreground">
          no route
        </Badge>
      )}
      <span className="font-mono text-xs text-muted-foreground tabular">{cost}</span>
    </span>
  )
}

function CaseMatrix({
  models,
  contracts,
  title = "Every contract, every model",
}: {
  models: EvalModel[]
  contracts: ContractSummary[] | null
  title?: string
}) {
  const ids = [...new Set(models.flatMap((m) => m.cases.map((c) => c.id)))].sort()
  const expectedOf = (id: string) => models.flatMap((m) => m.cases).find((c) => c.id === id)?.expected_route ?? null
  return (
    <Card className="gap-0 p-0">
      <CardHeader className="border-b py-4">
        <CardTitle className="font-heading text-lg font-semibold">{title}</CardTitle>
        <CardDescription className="flex flex-col gap-2">
          <span>Expected route from the labels, the route the scoring code produced, and the cost.</span>
          <span className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
            <span className="inline-flex items-center gap-1">
              <CircleCheck className="size-3.5 text-approve" aria-hidden /> pass
            </span>
            <span className="inline-flex items-center gap-1">
              <CircleX className="size-3.5 text-escalate" aria-hidden /> fail (wrong route or findings)
            </span>
            <span className="inline-flex items-center gap-1">
              <CircleDashed className="size-3.5 text-escalate" aria-hidden /> risky contract never routed
            </span>
            <span className="inline-flex items-center gap-1 font-semibold text-escalate">
              <ShieldAlert className="size-3.5" aria-hidden /> risky contract approved
            </span>
          </span>
        </CardDescription>
      </CardHeader>
      <ul className="divide-y md:hidden">
        {ids.map((id) => {
          const expected = expectedOf(id)
          return (
            <li key={id} className="flex flex-col gap-2 px-4 py-3">
              <span className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate font-mono text-[0.8rem] font-medium">{id}</span>
                <span className="text-xs text-muted-foreground">expected</span>
                {expected ? <RouteBadge route={expected} /> : "–"}
              </span>
              {models.map((m) => (
                <span key={keyOf(m)} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                  <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    {modelName(m.model)}
                    <VariantLabel m={m} />
                  </span>
                  <CaseResult m={m} id={id} />
                </span>
              ))}
            </li>
          )
        })}
      </ul>
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead className="ps-4">Contract</TableHead>
              <TableHead>Expected</TableHead>
              {models.map((m) => (
                <TableHead key={keyOf(m)} className="pe-4 align-top">
                  <span className="flex flex-col items-start gap-1 py-1">
                    {modelName(m.model)}
                    <VariantLabel m={m} />
                  </span>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {ids.map((id) => {
              const expected = expectedOf(id)
              const langs = contracts?.find((c) => c.doc_id === id)?.languages
              return (
                <TableRow key={id}>
                  <TableCell className="ps-4">
                    <span className="font-mono text-[0.8rem] font-medium">{id}</span>
                    {langs ? (
                      <span className="ms-2 text-[0.7rem] text-muted-foreground">{langs.map((l) => l.toUpperCase()).join(" + ")}</span>
                    ) : null}
                  </TableCell>
                  <TableCell>{expected ? <RouteBadge route={expected} /> : "–"}</TableCell>
                  {models.map((m) => (
                    <TableCell key={keyOf(m)} className="pe-4">
                      <CaseResult m={m} id={id} />
                    </TableCell>
                  ))}
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
    </Card>
  )
}

// --- area ----------------------------------------------------------------------------------------

/** Blind contracts written by a separate agent: the honest test of whether the guarantees generalise. */
function HeldOut({ models, contracts }: { models: EvalModel[]; contracts: ContractSummary[] | null }) {
  const ids = new Set(models.flatMap((m) => m.cases.map((c) => c.id)))
  const misses = models
    .filter((m) => m.variant !== null && !isLocal(m))
    .flatMap((m) =>
      m.cases
        .filter((c) => c.expected_route !== c.got_route)
        .map((c) => ({ m, c }))
    )
  return (
    <section className="flex flex-col gap-5" aria-labelledby="heldout-h">
      <Card className="gap-4">
        <CardHeader>
          <CardTitle id="heldout-h" className="flex flex-wrap items-center gap-2 text-lg font-semibold">
            <FlaskConical className="size-5 text-primary" aria-hidden />
            Held-out (blind) test
            <Badge variant="outline" className="rounded-md font-normal">
              {plural(ids.size, "contract")}
            </Badge>
          </CardTitle>
          <CardDescription className="flex flex-col gap-1">
            <span>
              Contracts written by a separate agent that never saw the red-flag patterns, the main contracts or their
              labels.
            </span>
            <span>{RED_FLAG_LIMIT}</span>
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <ul className="flex flex-col divide-y rounded-lg border bg-background/60">
            {models.map((m) => {
              const r = safety(m)
              const n = notSafe(r)
              return (
                <li key={keyOf(m)} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 text-sm">
                  <span className="font-medium">{modelName(m.model)}</span>
                  <VariantLabel m={m} />
                  {isLocal(m) ? <span className="text-xs text-muted-foreground">local</span> : null}
                  <span className="flex flex-wrap gap-x-4 gap-y-1 text-xs tabular sm:ms-auto">
                    <span>
                      route accuracy <span className="font-semibold">{percent(m.summary.route_accuracy)}</span>
                    </span>
                    <span>
                      pass <span className="font-semibold">{percent(m.summary.pass_rate)}</span>
                    </span>
                    <span className={n ? "font-semibold text-escalate" : "text-approve"}>
                      false auto-approve {m.summary.false_auto_approve}
                      {n ? ` (${r.approved} approved, ${r.unrouted} unrouted)` : ""}
                    </span>
                  </span>
                </li>
              )
            })}
          </ul>
          {misses.length ? (
            <div className="flex flex-col gap-1.5 rounded-lg border border-dashed p-3 text-sm leading-relaxed">
              {misses.map(({ m, c }) => (
                <p key={`${keyOf(m)}-${c.id}`}>
                  The {m.variant}
                  {m.variant?.includes(",") ? "," : ""} missed <span className="font-mono">{c.id}</span>: routed{" "}
                  {c.got_route ?? "nowhere"} instead of {c.expected_route ?? "–"}
                  {c.got_route !== "approve" ? ", never approved" : ""}.
                </p>
              ))}
              <p className="text-muted-foreground">
                The miss was an Arabic prompt injection. The fix lets the model report injected instructions as a second
                detector; the regex was not widened to fit the held-out wording.
              </p>
            </div>
          ) : null}
        </CardContent>
      </Card>
      <CaseMatrix models={models} contracts={contracts} title="Held-out contracts, every run" />
    </section>
  )
}

export function ProofView({ contracts }: { contracts: ContractSummary[] | null }) {
  const { data, error } = useResource("evals", loadEvals)

  if (!data) {
    return error ? (
      <Empty className="border bg-card">
        <EmptyHeader>
          <EmptyTitle>Eval results unavailable</EmptyTitle>
          <EmptyDescription>{error}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    ) : (
      <div className="flex flex-col gap-5">
        <Skeleton className="h-56 w-full rounded-lg" />
        <Skeleton className="h-72 w-full rounded-lg" />
      </div>
    )
  }

  if (data.filter((m) => m.suite !== "held-out").length === 0) {
    return (
      <Empty className="border bg-card py-16">
        <EmptyHeader>
          <EmptyTitle>No saved eval runs yet</EmptyTitle>
          <EmptyDescription>
            Run <code className="font-mono">uv run hack eval</code> to measure the agent on the contract suite.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  // Safe models first, then by pass rate; local models are discussed in their own note.
  // Kept in the API's order: current configuration first, then route accuracy, then cost.
  const models = data.filter((m) => m.suite !== "held-out")
  const heldOut = data.filter((m) => m.suite === "held-out")
  const local = models.filter(isLocal)
  const anyRegraded = models.some((m) => m.summary.rescored_from)

  return (
    <div className="flex flex-col gap-6">
      <Headline models={models} />
      <RoiCalculator
        model={models[0]}
        name={`${modelName(models[0].model)} ${variantText(models[0])}`}
        local={isLocal(models[0])}
      />

      <div className={cn("grid gap-5", models.length > 1 && "xl:grid-cols-2", models.length > 2 && "2xl:grid-cols-3")}>
        {models.map((m) => (
          <ModelCard key={keyOf(m)} m={m} />
        ))}
      </div>

      {[...new Set(local.map((m) => m.model))].map((model) => (
        <SovereignNote
          key={model}
          variants={local.filter((m) => m.model === model)}
          heldOut={heldOut.filter((m) => m.model === model)}
        />
      ))}

      {models.length > 1 ? <Comparison models={models} /> : null}
      <CaseMatrix models={models} contracts={contracts} />
      {heldOut.length ? <HeldOut models={heldOut} contracts={contracts} /> : null}

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="gap-4">
          <CardHeader>
            <CardTitle className="font-heading text-lg font-semibold">Guarantees enforced in code</CardTitle>
            <CardDescription>These hold whatever the model writes; the tests check each one.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-2.5">
              {GUARANTEES.map((g) => (
                <li key={g.text} className="flex items-start gap-2.5 text-sm leading-relaxed">
                  <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                  <span className="flex flex-col gap-1">
                    {g.text}
                    {g.note ? (
                      <span className="rounded-md border border-negotiate/30 bg-negotiate-soft/60 px-2 py-1 text-xs text-foreground/85">
                        {g.note}
                      </span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Collapsible className="h-fit rounded-lg bg-card ring-1 ring-foreground/10">
          <CollapsibleTrigger asChild>
            <Button variant="ghost" className="group h-auto w-full justify-start gap-2 rounded-lg px-4 py-4 text-start">
              <FlaskConical aria-hidden />
              <span className="font-heading text-lg font-semibold">How we measure</span>
              <ChevronDown
                className="ms-auto text-muted-foreground transition-transform group-data-[state=open]:rotate-180"
                aria-hidden
              />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="flex max-w-[68ch] flex-col gap-3 border-t px-4 py-4 text-sm leading-relaxed text-foreground/90">
            <p>
              The suite is a set of synthetic contracts written for this eval, in Arabic, English and both, each with
              seeded issues and an expected route. The labels were checked against the routing code.
            </p>
            <p>
              <span className="font-semibold">False auto-approve</span> counts contracts whose expected route is
              negotiate or escalate that the agent approved or never routed. It is the number that must stay at zero.
            </p>
            <p>
              <span className="font-semibold">Recall and precision</span> compare the rules the agent recorded with
              the labelled issues; a finding outside the labels counts against precision.
            </p>
            {anyRegraded ? (
              <p>
                A run marked re-graded was scored again against corrected labels from its saved traces; the model was
                not called again.
              </p>
            ) : null}
            <p>{RED_FLAG_LIMIT}</p>
            <p className="text-muted-foreground">
              It is a small sample: it shows whether the guarantees held on these cases, not a statistical error rate.
            </p>
          </CollapsibleContent>
        </Collapsible>
      </div>
    </div>
  )
}
