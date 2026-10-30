import { useCallback, useEffect, useRef, useState } from "react"

import { api, ApiError, type BatchStatus, type Contract, type ReviewView, type TraceEvent } from "@/lib/api"
import { smoothly } from "@/lib/transition"

// What was last loaded for each key. A view that is opened again shows it at once (no skeleton) and
// refreshes in the background, so moving between areas and runs never flashes an empty state.
const resourceCache = new Map<string, unknown>()
const polledCache = new Map<string, unknown>()

function cached<T>(cache: Map<string, unknown>, key: string | null): T | null {
  return key !== null && cache.has(key) ? (cache.get(key) as T) : null
}

/** One-shot GET with loading/error state, keyed by `key` (null = idle). `load` must be a stable function. */
export function useResource<T>(key: string | null, load: (key: string) => Promise<T>) {
  const [state, setState] = useState<{ key: string | null; data: T | null; error: string | null }>(() => {
    const data = cached<T>(resourceCache, key)
    return data !== null ? { key, data, error: null } : { key: null, data: null, error: null }
  })

  useEffect(() => {
    if (key === null) return
    let cancelled = false
    load(key).then(
      (data) => {
        resourceCache.set(key, data)
        if (!cancelled) setState({ key, data, error: null })
      },
      (e: unknown) => {
        if (!cancelled) setState({ key, data: null, error: e instanceof Error ? e.message : String(e) })
      }
    )
    return () => {
      cancelled = true
    }
  }, [key, load])

  const current = key !== null && state.key === key
  const fallback = current ? null : cached<T>(resourceCache, key)
  return {
    data: current ? state.data : fallback,
    error: current ? state.error : null,
    loading: key !== null && !current && fallback === null,
  }
}

const contractCache = new Map<string, Promise<Contract>>()

function loadContract(id: string): Promise<Contract> {
  let p = contractCache.get(id)
  if (!p) {
    p = api.contract(id)
    contractCache.set(id, p)
    p.catch(() => contractCache.delete(id))
  }
  return p
}

export function useContract(docId: string | null) {
  return useResource(docId, loadContract)
}

/**
 * GET with polling and manual refresh. Data is tagged with `key` (null = idle); a refresh of the same key
 * keeps showing the previous data. `next(data)` returns the delay before the next poll, or null to stop.
 */
export function usePolled<T>(
  key: string | null,
  load: (key: string) => Promise<T>,
  next: (data: T) => number | null
) {
  const [state, setState] = useState<{ key: string | null; data: T | null; error: string | null }>(() => {
    const data = cached<T>(polledCache, key)
    return data !== null ? { key, data, error: null } : { key: null, data: null, error: null }
  })
  const [tick, setTick] = useState(0)
  const nextRef = useRef(next)
  useEffect(() => {
    nextRef.current = next
  })

  useEffect(() => {
    if (key === null) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const run = async () => {
      try {
        const data = await load(key)
        polledCache.set(key, data)
        if (cancelled) return
        setState({ key, data, error: null })
        const ms = nextRef.current(data)
        if (ms !== null) timer = setTimeout(run, ms)
      } catch (e) {
        if (cancelled) return
        setState((s) => ({ key, data: s.key === key ? s.data : null, error: e instanceof Error ? e.message : String(e) }))
        timer = setTimeout(run, 5000)
      }
    }
    void run()
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [key, load, tick])

  const refresh = useCallback(() => setTick((t) => t + 1), [])
  const current = key !== null && state.key === key
  return { data: current ? state.data : cached<T>(polledCache, key), error: current ? state.error : null, refresh }
}

const loadRuns = () => api.runs(60)
const loadContracts = () => api.contracts()
const loadInbox = () => api.inbox()
const loadBatches = () => api.batches()
const loadBatch = (id: string) => api.batch(id)
const finished = (b: BatchStatus) => b.done + b.errors >= b.total

/** GET /runs, re-polled every few seconds while any run is running (or `keepPolling`). */
export function useRuns(keepPolling: boolean) {
  const { data, error, refresh } = usePolled("runs", loadRuns, (r) =>
    keepPolling || r.some((x) => x.status === "running") ? 3000 : null
  )
  return { runs: data, error, refresh }
}

export function useContracts() {
  return usePolled("contracts", loadContracts, () => null)
}

/** Items waiting for a human; polled so the header badge stays current. */
export function useInbox() {
  return usePolled("inbox", loadInbox, () => 5000)
}

export function useBatches(active: boolean) {
  return usePolled(active ? "batches" : null, loadBatches, (list) => (list.some((b) => !finished(b)) ? 3000 : 15000))
}

/** One batch, polled every 1.5 s until every item is done or failed. */
export function useBatch(id: string | null) {
  return usePolled(id, loadBatch, (b) => (finished(b) ? null : 1500))
}

export type RunPhase = "idle" | "loading" | "starting" | "ready" | "error"

interface RunData {
  review: ReviewView
  trace: TraceEvent[]
}
const runCache = new Map<string, RunData>()
const prefetching = new Set<string>()

/** Load a run (and its contract) before it is opened, e.g. while the pointer is over it in History. */
export function prefetchRun(runId: string, docId?: string | null) {
  if (docId) void loadContract(docId).then((c) => resourceCache.set(docId, c), () => {})
  if (runCache.has(runId) || prefetching.has(runId)) return
  prefetching.add(runId)
  Promise.all([api.review(runId), api.trace(runId)])
    .then(([review, trace]) => {
      if (review.status !== "starting") runCache.set(runId, { review, trace })
    })
    .catch(() => {})
    .finally(() => prefetching.delete(runId))
}

interface RunState {
  runId: string | null
  review: ReviewView | null
  trace: TraceEvent[] | null
  phase: RunPhase
  error: string | null
}

/**
 * Review + trace for one run. Polls every second while the run is in flight:
 * a 404 while `live` means the agent has not written its first event yet ("starting").
 * Polling stops when the review reports status "done", or once `live` drops and a final fetch is made.
 *
 * Opening another run never blanks the screen: a run loaded before (or prefetched) shows at once;
 * otherwise the previous run stays on screen, marked stale, until the new one arrives and replaces it
 * with a crossfade. The returned runId is the run the data belongs to.
 */
export function useRunData(runId: string | null, live: boolean) {
  const [state, setState] = useState<RunState>(() => {
    const hit = runId ? runCache.get(runId) : undefined
    return hit
      ? { runId, review: hit.review, trace: hit.trace, phase: "ready", error: null }
      : { runId: null, review: null, trace: null, phase: "idle", error: null }
  })
  const liveRef = useRef(live)
  const kick = useRef<() => void>(() => {})
  const shownRef = useRef(state.runId)
  useEffect(() => {
    shownRef.current = state.runId
  }, [state.runId])

  useEffect(() => {
    const wasLive = liveRef.current
    liveRef.current = live
    if (wasLive && !live) kick.current() // POST settled: fetch the final state now
  }, [live])

  useEffect(() => {
    if (!runId) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let inflight = false
    let early404 = 0 // a demo replay has no trace file until its first event (under 2 s)
    // With a cached copy the right run is already on screen; otherwise the first data swaps runs.
    const swapping = !runCache.has(runId)

    const show = (next: RunState) => {
      const apply = () => setState(next)
      if (swapping && shownRef.current !== runId) smoothly(apply)
      else apply()
    }

    const load = async () => {
      if (inflight) return
      inflight = true
      clearTimeout(timer)
      try {
        const [review, trace] = await Promise.all([api.review(runId), api.trace(runId)])
        if (cancelled) return
        if (review.status === "starting") {
          // Accepted by the API, no trace event yet: show the Starting state and keep asking.
          show({ runId, review: null, trace: null, phase: "starting", error: null })
          timer = setTimeout(load, 1000)
          return
        }
        runCache.set(runId, { review, trace })
        show({ runId, review, trace, phase: "ready", error: null })
        // Keep following while the agent is still writing; a run started elsewhere is followed too.
        // A finished run is re-read every few seconds so a decision made in the Inbox shows up here.
        if (review.status === "running") timer = setTimeout(load, 1000)
        else if (review.pending) timer = setTimeout(load, 4000)
      } catch (e) {
        if (cancelled) return
        if (e instanceof ApiError && e.status === 404 && (liveRef.current || (runId.startsWith("demo-") && early404++ < 8))) {
          setState((s) => ({ ...s, runId, phase: "starting" }))
          timer = setTimeout(load, 1000)
        } else if (liveRef.current) {
          timer = setTimeout(load, 1500) // transient failure mid-run: keep trying while the POST is open
        } else {
          const error = e instanceof Error ? e.message : String(e)
          show({ runId, review: null, trace: null, phase: "error", error })
        }
      } finally {
        inflight = false
      }
    }
    kick.current = () => void load()
    // A run we just POSTed: give the API a moment to register it, so the first poll is not a 404.
    if (liveRef.current) timer = setTimeout(load, 500)
    else void load()
    return () => {
      cancelled = true
      clearTimeout(timer)
      kick.current = () => {}
    }
  }, [runId])

  const idle = { runId: null, review: null, trace: null, error: null, stale: false }
  if (!runId) return { ...idle, phase: "idle" as RunPhase }
  if (state.runId === runId) return { ...state, stale: false }
  const hit = runCache.get(runId)
  if (hit) return { runId, review: hit.review, trace: hit.trace, phase: "ready" as RunPhase, error: null, stale: false }
  if (live) return { ...idle, runId, phase: "starting" as RunPhase }
  // Not loaded yet: keep the previous run on screen (the caller dims it) rather than a skeleton.
  if (state.review) return { ...state, phase: "loading" as RunPhase, stale: true }
  return { ...idle, runId, phase: "loading" as RunPhase }
}
