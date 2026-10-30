import { FileText, Lock, Play, ScanText } from "lucide-react"

import { LangChips } from "@/components/new-review-panel"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import type { Contract, ContractSummary } from "@/lib/api"
import { contractTitle, langOf, plural } from "@/lib/format"

const SOURCE_LABEL: Record<ContractSummary["source"], string> = {
  sample: "Sample contract",
  "held-out": "Held-out test contract",
  real: "Real contract (public source)",
  upload: "Your upload",
}

/** A contract that has not been reviewed yet: what it is, its opening clauses, and the way to review it. */
export function ContractOverview({
  summary,
  contract,
  busy,
  onReview,
  onRead,
}: {
  summary: ContractSummary
  contract: Contract | null
  busy: boolean
  onReview: () => void
  onRead: () => void
}) {
  if (summary.readable === false) {
    // Your role may not open it: nothing of the contract or its reviews reaches this screen.
    return (
      <Card className="gap-3 px-5 py-8 sm:px-8">
        <span className="flex items-center gap-2 text-sm font-semibold text-escalate">
          <Lock className="size-4" aria-hidden />
          Restricted
        </span>
        <p className="font-mono text-xs text-muted-foreground">{summary.doc_id}</p>
        <p className="max-w-prose text-sm leading-relaxed text-foreground/90">
          Only Legal can open this contract and its reviews, whoever reviewed it. Its text, findings and outcome are
          not sent to your account. Ask Legal if you need the outcome.
        </p>
      </Card>
    )
  }
  const title = contractTitle(summary.title)
  const opening = contract?.clauses.slice(0, 3) ?? null
  return (
    <Card className="gap-0 p-0">
      <div className="flex flex-col gap-4 border-b px-5 py-6 sm:px-8 sm:py-8">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>{SOURCE_LABEL[summary.source]}</span>
          <span aria-hidden>·</span>
          <span className="font-mono">{summary.doc_id}</span>
          <span aria-hidden>·</span>
          <span className="tabular">{plural(summary.clauses, "clause")}</span>
          <LangChips languages={summary.languages} />
          {summary.ocr ? (
            <span className="inline-flex items-center gap-1">
              <ScanText className="size-3.5" aria-hidden /> read by OCR
            </span>
          ) : null}
        </div>
        <h2 dir="auto" lang={langOf(title.primary)} className="text-2xl leading-snug font-semibold sm:text-[1.75rem]">
          {title.primary}
        </h2>
        <p className="max-w-prose text-[0.95rem] text-muted-foreground">
          Not reviewed yet. A review reads every clause against the playbook, quotes each issue word for word, drafts
          the redline, and routes the contract.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={onReview} disabled={busy} className="h-10">
            <Play aria-hidden />
            Review contract
          </Button>
          <Button variant="outline" onClick={onRead} className="h-10 bg-background">
            <FileText aria-hidden />
            Read the contract
          </Button>
        </div>
      </div>
      <div className="flex flex-col gap-3 px-5 py-5 sm:px-8">
        <span className="text-xs font-medium text-muted-foreground">Opening clauses</span>
        {opening ? (
          <ol className="flex flex-col gap-3">
            {opening.map((c) => (
              <li key={c.id} className="grid grid-cols-[2.5rem_minmax(0,1fr)] gap-2 text-sm">
                <span className="pt-0.5 font-mono text-xs text-muted-foreground">{c.id}</span>
                <p dir="auto" lang={c.lang} className="line-clamp-3 leading-relaxed text-foreground/85">
                  {c.text}
                </p>
              </li>
            ))}
          </ol>
        ) : (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        )}
      </div>
    </Card>
  )
}
