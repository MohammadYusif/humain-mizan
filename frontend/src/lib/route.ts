/** Hash routes, so every screen (and a run or batch inside it) has a link: #run=<id>, #batch=<id>, #inbox, #proof. */

export type Area = "review" | "queue" | "inbox" | "insights" | "proof"

export interface Loc {
  area: Area
  runId: string | null
  batchId: string | null
}

const ID = "[A-Za-z0-9_-]{1,64}"

export function parseHash(hash: string): Loc {
  const run = new RegExp(`^#run=(${ID})$`).exec(hash)
  if (run) return { area: "review", runId: run[1], batchId: null }
  const batch = new RegExp(`^#batch=(${ID})$`).exec(hash)
  if (batch) return { area: "queue", runId: null, batchId: batch[1] }
  if (hash === "#queue") return { area: "queue", runId: null, batchId: null }
  if (hash === "#inbox") return { area: "inbox", runId: null, batchId: null }
  if (hash === "#proof") return { area: "proof", runId: null, batchId: null }
  if (hash === "#insights") return { area: "insights", runId: null, batchId: null }
  return { area: "review", runId: null, batchId: null }
}

export function toHash(loc: Loc): string {
  if (loc.area === "review") return loc.runId ? `#run=${loc.runId}` : "#review"
  if (loc.area === "queue") return loc.batchId ? `#batch=${loc.batchId}` : "#queue"
  return `#${loc.area}`
}

/** Navigate by changing the hash; the app listens to hashchange, so back/forward work too. */
export function go(loc: Partial<Loc> & { area: Area }) {
  const h = toHash({ runId: null, batchId: null, ...loc })
  if (window.location.hash !== h) window.location.hash = h
}
