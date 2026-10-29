import { ArrowRight, FileText, LoaderCircle, Play, Upload } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import type { ContractSummary, Lang } from "@/lib/api"
import { contractTitle, langOf, plural } from "@/lib/format"

export function LangChips({ languages }: { languages: Lang[] }) {
  return (
    <span className="inline-flex gap-1">
      {languages.map((l) => (
        <Badge
          key={l}
          variant="outline"
          className="h-4.5 rounded px-1.5 font-mono text-[0.625rem] font-medium tracking-wider text-muted-foreground uppercase"
        >
          {l}
        </Badge>
      ))}
    </span>
  )
}

interface Props {
  contracts: ContractSummary[] | null
  docId: string | null
  onDocChange: (id: string) => void
  onReview: () => void
  onUpload: () => void
  busy: boolean
}

function ContractOption({ c }: { c: ContractSummary }) {
  return (
    <SelectItem value={c.doc_id} className="py-1.5">
      <span className="flex w-full min-w-0 items-center gap-2">
        <span className="truncate font-mono text-[0.8rem]">{c.doc_id}</span>
        <LangChips languages={c.languages} />
        <span className="text-xs text-muted-foreground tabular">{c.clauses} cl.</span>
      </span>
    </SelectItem>
  )
}

export function NewReviewPanel({ contracts, docId, onDocChange, onReview, onUpload, busy }: Props) {
  const samples = contracts?.filter((c) => c.source !== "upload") ?? []
  const uploads = contracts?.filter((c) => c.source === "upload") ?? []
  const selected = contracts?.find((c) => c.doc_id === docId) ?? null
  const title = selected ? contractTitle(selected.title) : null

  return (
    <Card className="shrink-0 gap-5">
      <CardHeader>
        <CardTitle className="font-heading text-lg font-semibold">New review</CardTitle>
        <CardDescription>
          The agent reads every clause, records findings with exact quotes, then the scoring code routes it.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <button
          type="button"
          onClick={onUpload}
          className="group flex w-full items-center gap-3 rounded-lg border border-dashed border-brass/60 bg-brass-soft/50 p-3 text-start transition-colors outline-none hover:bg-brass-soft focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <span className="grid size-9 shrink-0 place-items-center rounded-md bg-brass-soft text-brass-ink ring-1 ring-brass/30">
            <Upload className="size-4" aria-hidden />
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="text-sm font-semibold">Use your own contract</span>
            <span className="text-xs text-muted-foreground">Upload a PDF or Word file, or paste text</span>
          </span>
          <ArrowRight className="ms-auto size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 rtl:rotate-180" aria-hidden />
        </button>
        <div className="flex flex-col gap-2">
          <label htmlFor="contract-select" className="text-xs font-medium text-muted-foreground">
            Contract
          </label>
          {contracts ? (
            <Select value={docId ?? undefined} onValueChange={onDocChange} disabled={busy}>
              <SelectTrigger id="contract-select" className="w-full bg-background font-mono text-[0.8rem]">
                <SelectValue placeholder="Choose a contract" />
              </SelectTrigger>
              <SelectContent position="popper" className="max-h-80">
                {uploads.length > 0 ? (
                  <>
                    <SelectGroup>
                      <SelectLabel>Your uploads</SelectLabel>
                      {uploads.map((c) => (
                        <ContractOption key={c.doc_id} c={c} />
                      ))}
                    </SelectGroup>
                    <SelectSeparator />
                  </>
                ) : null}
                <SelectGroup>
                  <SelectLabel>Samples</SelectLabel>
                  {samples.map((c) => (
                    <ContractOption key={c.doc_id} c={c} />
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          ) : (
            <Skeleton className="h-8 w-full" />
          )}
        </div>

        {selected && title ? (
          <div className="rounded-lg border bg-background/60 p-3">
            <div className="mb-1.5 flex items-center gap-2 text-xs text-muted-foreground">
              <FileText className="size-3.5" aria-hidden />
              <span className="tabular">{plural(selected.clauses, "clause")}</span>
              <LangChips languages={selected.languages} />
            </div>
            <p dir="auto" lang={langOf(title.primary)} className="line-clamp-3 text-sm text-foreground">
              {title.primary}
            </p>
            {title.secondary ? (
              <p dir="auto" lang={langOf(title.secondary)} className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                {title.secondary}
              </p>
            ) : null}
          </div>
        ) : contracts ? null : (
          <Skeleton className="h-20 w-full" />
        )}

        <Button size="lg" className="h-10 w-full text-sm" disabled={!docId || busy} onClick={onReview}>
          {busy ? <LoaderCircle className="animate-spin" aria-hidden /> : <Play aria-hidden />}
          {busy ? "Reviewing…" : "Review contract"}
        </Button>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Sending to the counterparty or escalating to legal runs as a dry-run unless writes are approved on the
          server.
        </p>
      </CardContent>
    </Card>
  )
}
