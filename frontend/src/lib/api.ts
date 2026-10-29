// Typed client for the FastAPI backend (src/hack/api.py, src/hack/workflow.py, src/hack/challenge/view.py).

export type Route = "approve" | "negotiate" | "escalate"
export type Severity = "critical" | "major" | "minor"
export type Lang = "ar" | "en"
export type RunStatus = "done" | "running" | "error"
/** "starting": accepted by the API, first trace event not written yet (review endpoint only). */
export type ReviewStatus = RunStatus | "starting"
/** unrouted: the run finished without a route, so a lawyer reviews the whole contract. */
export type NeedsHuman = "legal_review" | "approve_send" | "unrouted"
export type DecisionKind = "approve_contract" | "request_changes" | "reject" | "send" | "discard"

export interface Health {
  status: string
  provider: string
  model: string
  approve_writes?: boolean
}

export interface ContractSummary {
  doc_id: string
  title: string
  clauses: number
  languages: Lang[]
  source: "sample" | "upload"
}

export interface Clause {
  id: string
  lang: Lang
  text: string
}

export interface Contract {
  doc_id: string
  title: string
  clauses: Clause[]
}

export interface PlaybookRule {
  id: string
  clause_type: string
  severity: Severity
  required: string
  fallback: string
  hint: string
  /** Amendments legal accepted through the Insights loop. */
  accepted_by_legal?: string[]
}

export interface RunSummary {
  run_id: string
  task: string
  model: string
  doc_id: string | null
  route: Route | null
  status: RunStatus
  cost_usd: number | null
  priced: boolean | null
  latency_s: number | null
  needs_human: NeedsHuman | null
  /** Set on demo replays: the recorded run this one replays (never a live run). */
  replay_of?: string | null
  started: number
}

export interface Usage {
  input_tokens: number
  output_tokens: number
  cache_read_tokens?: number
  cache_write_tokens?: number
}

export interface Finding {
  clause_id: string
  rule_id: string
  severity: Severity
  clause_type: string
  quote: string
  issue: string
  redline: string
  confidence: number | null
}

export interface WriteAction {
  kind: "counterparty" | "legal"
  dry_run: boolean
  text: string
}

export interface RunEndEvent {
  t: number
  type: "run_end"
  stop_reason: string
  turns: number
  usage: Usage
  cost_usd: number
  latency_s: number
  priced?: boolean
}

export interface DecisionRecord {
  decision: DecisionKind
  kind: NeedsHuman
  note: string
  message: string | null
  /** "human", or "workflow (auto-send policy)" when the batch policy sent a redline itself. */
  by?: string
  at: number
}

export type TripwireStatus = "critical" | "recorded" | "cleared" | "unresolved"

/** A deterministic red flag: a pattern match for a playbook rule, independent of the model. */
export interface Tripwire {
  clause_id: string
  rule_id: string
  critical: boolean
  /** The matched words, normalised (lower-case, Arabic letters unified). */
  match: string
  status: TripwireStatus
}

/** The model's justification when it judged a flagged clause compliant (clear_tripwire). */
export interface ClearedFlag {
  clause_id: string
  rule_id: string
  reason: string
  quote: string
}

export interface ReviewView {
  doc_id: string | null
  route: Route | null
  risk_score: number | null
  counts: Record<Severity, number> | null
  reasons: string[]
  injected: string[]
  tripwires: Tripwire[]
  cleared: ClearedFlag[]
  findings: Finding[]
  clause_map: Record<string, string[]> | null
  actions: WriteAction[]
  memo: string
  status: ReviewStatus
  stats: RunEndEvent | null
  decision: DecisionRecord | null
  pending: NeedsHuman | null
  replay_of?: string | null
  final_text: string
}

export interface ToolCallRef {
  id: string
  name: string
  input: unknown
}

export type TraceEvent =
  | { t: number; type: "run_start"; task: string; model: string; provider?: string }
  | {
      t: number
      type: "llm_call"
      turn: number
      stop_reason: string
      text: string
      tool_calls: ToolCallRef[]
      usage: Usage
      cost_usd: number
      latency_s: number
      request_id?: string
    }
  | {
      t: number
      type: "tool_call"
      turn: number
      name: string
      input: unknown
      output: string
      is_error: boolean
      duration_s: number
    }
  | RunEndEvent
  /** The loop's completion check: the model tried to stop with steps left (at most 2 per run). */
  | { t: number; type: "nudge"; turn: number; n: number; text: string }
  | { t: number; type: "error"; [key: string]: unknown }

export interface RunResponse {
  run_id: string
  final_text: string
  route: Route | null
  stop_reason: string
  turns: number
  tool_calls: string[]
  input_tokens: number
  output_tokens: number
  cost_usd: number
  latency_s: number
  model: string
}

export interface BatchManifest {
  batch_id: string
  created: number
  auto_send: boolean
  items: { doc_id: string; run_id: string }[]
}

export interface BatchItem {
  doc_id: string
  run_id: string
  status: "queued" | RunStatus
  route: Route | null
  risk_score: number | null
  counts: Record<Severity, number> | null
  pending: NeedsHuman | null
  decision: DecisionKind | null
  /** null | "human" | "workflow (auto-send policy)"; older decisions without a `by` read as "human". */
  decided_by: string | null
  sent: boolean
  cost_usd: number | null
  priced: boolean | null
  latency_s: number | null
}

export interface BatchStatus {
  batch_id: string
  created: number
  auto_send: boolean
  total: number
  done: number
  errors: number
  routes: Record<Route | "unrouted", number>
  needs_human: number
  cost_usd: number
  priced: boolean | null
  /** The part of the cost that could be priced, and how many runs used an unpriced (e.g. local) model. */
  priced_cost_usd: number
  unpriced_runs: number
  agent_minutes: number
  estimate: {
    manual_hours: number
    human_hours_with_agent: number
    hours_saved: number
    assumptions: string
  }
  items: BatchItem[]
}

export interface InboxItem {
  run_id: string
  kind: NeedsHuman
  doc_id: string | null
  route: Route | null
  risk_score: number | null
  counts: Record<Severity, number> | null
  reasons: string[]
  findings: Finding[]
  agent_text: string
  tripwires: Tripwire[]
  options: DecisionKind[]
  created: number
}

export interface EvalSummary {
  model: string
  provider?: string
  cases: number
  passed?: number
  pass_rate: number
  route_accuracy: number
  false_auto_approve: string
  recall: number | null
  precision: number | null
  latency_p50_s: number
  latency_p95_s: number
  cost_usd: number
  cost_per_pass_usd: number | null
  /** Set when the run was re-graded against corrected labels from its saved traces (no new model calls). */
  rescored_from?: string
}

export interface EvalCase {
  id: string
  passed: boolean
  expected_route: Route | null
  got_route: Route | null
  cost_usd: number | null
  latency_s: number | null
  labelled_rules: string[] | null
  recorded_rules: string[] | null
}

export interface EvalModel {
  model: string
  /** null = the current agent (with red-flag checks); otherwise e.g. "before red-flag tripwires". */
  variant: string | null
  file: string
  date: number
  summary: EvalSummary
  cases: EvalCase[]
}

export interface DemoScene {
  id: string
  doc_id: string
  title: string
  narration: string
  route: Route
  recorded_run: string
  model: string
}

export interface InsightEvidence {
  run_id: string
  doc_id: string | null
  clause_id: string
  quote: string
  decision: DecisionKind
  note: string
}

export interface Proposal {
  id: string
  rule_id: string
  clause_type: string
  current_fallback: string
  proposed_addition: string
  why: string
  effect: string
  evidence: InsightEvidence[]
}

export interface Amendment {
  id: string
  rule_id: string
  text: string
  note: string
  at: number
  evidence_runs: string[]
}

export interface Insights {
  signals: Record<string, { accepted: number; upheld: number }>
  proposals: Proposal[]
  notes: { rule_id: string; text: string; evidence: InsightEvidence[] }[]
  amendments: Amendment[]
  min_accepted: number
}

export class ApiError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
    this.name = "ApiError"
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  const json = typeof init?.body === "string"
  try {
    res = await fetch(path, {
      ...init,
      // FormData bodies set their own multipart boundary header.
      headers: { Accept: "application/json", ...(json ? { "Content-Type": "application/json" } : {}) },
    })
  } catch {
    throw new ApiError(0, "Cannot reach the review API")
  }
  if (!res.ok) {
    let detail = res.statusText || "Request failed"
    try {
      const body = (await res.json()) as { detail?: unknown }
      if (typeof body.detail === "string") detail = body.detail
      else if (Array.isArray(body.detail)) {
        detail = body.detail.map((d: { msg?: string }) => d.msg ?? JSON.stringify(d)).join("; ")
      } else if (body.detail) detail = JSON.stringify(body.detail)
    } catch {
      /* non-JSON error body: keep statusText */
    }
    throw new ApiError(res.status, detail)
  }
  return (await res.json()) as T
}

const enc = encodeURIComponent
const post = (body: unknown): RequestInit => ({ method: "POST", body: JSON.stringify(body) })

export const api = {
  health: () => request<Health>("/healthz"),
  contracts: () => request<ContractSummary[]>("/contracts"),
  contract: (docId: string) => request<Contract>(`/contracts/${enc(docId)}`),
  uploadContract: (form: FormData) => request<ContractSummary>("/contracts", { method: "POST", body: form }),
  playbook: () => request<PlaybookRule[]>("/playbook"),
  runs: (limit = 40) => request<RunSummary[]>(`/runs?limit=${limit}`),
  review: (runId: string) => request<ReviewView>(`/runs/${enc(runId)}/review`),
  trace: (runId: string) => request<TraceEvent[]>(`/runs/${enc(runId)}/trace`),
  run: (task: string, runId: string) => request<RunResponse>("/run", post({ task, run_id: runId })),
  decide: (runId: string, body: { decision: DecisionKind; note?: string; message?: string }) =>
    request<DecisionRecord>(`/runs/${enc(runId)}/decision`, post(body)),
  inbox: () => request<InboxItem[]>("/inbox"),
  batches: () => request<BatchStatus[]>("/batches"),
  batch: (id: string) => request<BatchStatus>(`/batches/${enc(id)}`),
  startBatch: (docIds: string[], autoSend: boolean) =>
    request<BatchManifest>("/batches", post({ doc_ids: docIds, auto_send: autoSend })),
  evals: () => request<EvalModel[]>("/evals"),
  demoScenes: () => request<DemoScene[]>("/demo/scenes"),
  demoReplay: (sceneId: string, speed = 3) =>
    request<{ run_id: string; scene: DemoScene }>("/demo/replay", post({ scene_id: sceneId, speed })),
  demoReset: () => request<{ deleted: number }>("/demo/reset", { method: "POST" }),
  insights: () => request<Insights>("/insights"),
  decideProposal: (id: string, action: "accept" | "reject", note?: string) =>
    request<{ id: string; status: string }>(`/insights/proposals/${enc(id)}`, post({ action, note: note ?? "" })),
}

export const exportUrl = (runId: string, kind: "redline.docx" | "memo.docx") => `/runs/${enc(runId)}/export/${kind}`

/** Client-chosen run id so the UI can poll the trace while POST /run blocks. Matches ^[A-Za-z0-9_-]{1,64}$. */
export function newRunId(): string {
  const rand = Math.random().toString(36).slice(2, 8).padEnd(6, "0")
  return `ui-${Date.now().toString(36)}-${rand}`
}

/** What to show a person: the server's `detail` text (no status-code prefix), or the network failure. */
export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}
