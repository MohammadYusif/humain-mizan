import { useState } from "react"

/**
 * Which keys arrived after a list first rendered with data. Only those animate: what was already on
 * screen when the view opened stays still, so motion marks a change (a finding recorded, a run
 * finishing), never a page load. React keeps a DOM node per key, so the entry animation plays once
 * even though its class stays. `scope` resets the baseline, e.g. when another run is opened.
 * (State adjusted during render: React's pattern for information from previous renders.)
 */
export function useArrivals(keys: readonly string[] | null | undefined, scope?: string) {
  const [base, setBase] = useState(() => ({ scope, initial: keys ? new Set(keys) : null }))
  let current = base
  if (base.scope !== scope || (base.initial === null && keys)) {
    current = { scope, initial: keys ? new Set(keys) : null }
    setBase(current)
  }
  const initial = current.initial
  return (key: string) => initial !== null && !initial.has(key)
}

/** Entry motion for something that just arrived in a list or a status that just changed. */
export const ARRIVE = "animate-in fade-in-0 slide-in-from-bottom-1 duration-300 ease-out"
export const ARRIVE_TOP = "animate-in fade-in-0 slide-in-from-top-1 duration-300 ease-out"
export const REVEAL = "animate-in fade-in-0 zoom-in-[0.98] duration-300 ease-out"
