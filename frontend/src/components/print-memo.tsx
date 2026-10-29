import { Printer } from "lucide-react"
import { useEffect } from "react"

import { RichText } from "@/components/rich-text"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useResource } from "@/hooks/use-api"
import { api, type ContractSummary } from "@/lib/api"
import { contractTitle, DECISION_LABEL, langOf, ROUTE_LABEL } from "@/lib/format"

const loadReview = (id: string) => api.review(id)

/** #print=<run>: the memo as a plain document, for the browser's Print / Save as PDF. */
export function PrintMemo({ runId, contracts }: { runId: string; contracts: ContractSummary[] | null }) {
  const { data: r, error } = useResource(runId, loadReview)
  const contract = contracts?.find((c) => c.doc_id === r?.doc_id) ?? null
  const title = contract ? contractTitle(contract.title).primary : (r?.doc_id ?? runId)

  useEffect(() => {
    document.title = `Memo · ${r?.doc_id ?? runId}`
  }, [r?.doc_id, runId])

  return (
    <div className="min-h-dvh bg-background print:bg-white print:text-black">
      <div className="mx-auto max-w-3xl px-6 py-10 print:max-w-none print:px-0 print:py-0">
        <div className="mb-8 flex items-center gap-3 print:hidden">
          <Button onClick={() => window.print()}>
            <Printer aria-hidden />
            Print or save as PDF
          </Button>
          <Button variant="ghost" onClick={() => window.close()}>
            Close
          </Button>
        </div>
        {!r ? (
          error ? (
            <p className="text-sm">{error}</p>
          ) : (
            <Skeleton className="h-96 w-full" />
          )
        ) : (
          <article className="flex flex-col gap-6 text-[0.95rem] leading-relaxed">
            <header className="flex flex-col gap-2 border-b pb-4 print:border-black/30">
              <p className="text-xs tracking-[0.14em] text-muted-foreground uppercase print:text-black/60">
                Mizan · contract review memo · {r.doc_id}
              </p>
              <h1 dir="auto" lang={langOf(title)} className="text-2xl leading-snug font-semibold">
                {title}
              </h1>
              <p className="text-sm">
                Route: <strong>{r.route ? ROUTE_LABEL[r.route] : "no valid route"}</strong>
                {r.risk_score != null ? ` · risk ${r.risk_score}/100` : ""}
                {r.counts ? ` · ${r.counts.critical} critical, ${r.counts.major} major, ${r.counts.minor} minor` : ""}
                {r.decision ? ` · ${DECISION_LABEL[r.decision.decision]}` : ""}
                {r.replay_of ? " · replay of a recorded run" : ""}
              </p>
            </header>
            {r.memo ? (
              <section>
                <h2 className="mb-2 text-lg font-semibold">Memo</h2>
                <RichText text={r.memo} />
              </section>
            ) : null}
            {r.findings.length ? (
              <section className="flex flex-col gap-3">
                <h2 className="text-lg font-semibold">Findings and redlines</h2>
                {r.findings.map((f) => (
                  <div key={`${f.clause_id}-${f.rule_id}`} className="break-inside-avoid border-s-2 ps-3 print:border-black/40">
                    <p className="text-sm font-semibold">
                      {f.severity.toUpperCase()} · {f.rule_id} · clause {f.clause_id}
                    </p>
                    <p dir="auto" lang={langOf(f.quote)} className="italic">
                      “{f.quote}”
                    </p>
                    <p dir="auto" lang={langOf(f.issue)}>
                      {f.issue}
                    </p>
                    {f.redline ? (
                      <p dir="auto" lang={langOf(f.redline)}>
                        <strong>Redline:</strong> {f.redline}
                      </p>
                    ) : null}
                  </div>
                ))}
              </section>
            ) : null}
            <footer className="border-t pt-3 text-xs text-muted-foreground print:border-black/30 print:text-black/60">
              Run {runId}. The route is computed by code from the recorded findings; this memo is not legal advice.
            </footer>
          </article>
        )}
      </div>
    </div>
  )
}
