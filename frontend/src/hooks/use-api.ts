import { useCallback, useEffect, useRef, useState } from "react"

import { api, ApiError, type BatchStatus, type Contract, type ReviewView, type TraceEvent } from "@/lib/api"

/** One-shot GET with loading/error state, keyed by `key` (null = idle). `load` must be a stable function. */
export function useResource<T>(key: string | null, load: (key: string) => Promise<T>) {
  const [state, setState] = useState<{ key: string | null; data: T | null; error: string | null }>({
    key: null,
    data: null,
    error: null,
  })

  useEffect(() => {
    if (key === null) return
    let cancelled = false
    load(key).then(
      (data) => {
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
  return { data: current ? state.data : null, error: current ? state.error : null, loading: key !== null && !current }
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
  const [state, setState] = useState<{ key: string | null; data: T | null; error: string | null }>({
    key: null,
    data: null,
    error: null,
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
  return { data: current ? state.data : null, error: current ? state.error : null, refresh }
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

/**
 * Review + trace for one run. Polls every second while the run is in flight:
 * a 404 while `live` means the agent has not written its first event yet ("starting").
 * Polling stops when the review reports status "done", or once `live` drops and a final fetch is made.
 */
export function useRunData(runId: string | null, live: boolean) {
  // State is tagged with the run it belongs to; anything for another run is treated as not loaded yet.
  const [state, setState] = useState<{
    runId: string | null
    review: ReviewView | null
    trace: TraceEvent[] | null
    phase: RunPhase
    error: string | null
  }>({ runId: null, review: null, trace: null, phase: "idle", error: null })
  const liveRef = useRef(live)
  const kick = useRef<() => void>(() => {})

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

    const load = async () => {
      if (inflight) return
      inflight = true
      clearTimeout(timer)
      try {
        const [review, trace] = await Promise.all([api.review(runId), api.trace(runId)])
        if (cancelled) return
        if (review.status === "starting") {
          // Accepted by the API, no trace event yet: show the Starting state and keep asking.
          setState({ runId, review: null, trace: null, phase: "starting", error: null })
          timer = setTimeout(load, 1000)
          return
        }
        setState({ runId, review, trace, phase: "ready", error: null })
        // Keep following while the agent is still writing; a run started elsewhere is followed too.
        // A finished run is re-read every few seconds so a decision made in the Inbox shows up here.
        if (review.status === "running") timer = setTimeout(load, 1000)
        else if (review.pending) timer = setTimeout(load, 4000)
      } catch (e) {
        if (cancelled) return
        if (e instanceof ApiError && e.status === 404 && liveRef.current) {
          setState((s) => ({ ...s, runId, phase: "starting" }))
          timer = setTimeout(load, 1000)
        } else if (liveRef.current) {
          timer = setTimeout(load, 1500) // transient failure mid-run: keep trying while the POST is open
        } else {
          const error = e instanceof Error ? e.message : String(e)
          setState({ runId, review: null, trace: null, phase: "error", error })
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

  if (!runId) return { review: null, trace: null, phase: "idle" as RunPhase, error: null }
  if (state.runId !== runId) return { review: null, trace: null, phase: (live ? "starting" : "loading") as RunPhase, error: null }
  return { review: state.review, trace: state.trace, phase: state.phase, error: state.error }
}
