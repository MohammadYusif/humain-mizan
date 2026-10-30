import { LoaderCircle, Play, ScanText, Upload } from "lucide-react"

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
          className="h-4.5 rounded px-1.5 font-mono text-[0.7rem] font-medium text-muted-foreground"
        >
          {l.toUpperCase()}
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
        {c.ocr ? <ScanText className="size-3.5 text-muted-foreground" aria-label="Scan read by OCR" /> : null}
        <span className="text-xs text-muted-foreground tabular">{c.clauses} cl.</span>
      </span>
    </SelectItem>
  )
}

export function NewReviewPanel({ contracts, docId, onDocChange, onReview, onUpload, busy }: Props) {
  const samples = contracts?.filter((c) => c.source === "sample" || c.source === "held-out") ?? []
  const real = contracts?.filter((c) => c.source === "real") ?? []
  const uploads = contracts?.filter((c) => c.source === "upload") ?? []
  const selected = contracts?.find((c) => c.doc_id === docId) ?? null
  const title = selected ? contractTitle(selected.title) : null

  return (
    <Card className="shrink-0 gap-5">
      <CardHeader>
        <CardTitle className="font-heading text-lg font-semibold">New review</CardTitle>
        <CardDescription>Choose a contract or upload your own.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Button variant="outline" className="h-10 w-full justify-start bg-background" onClick={onUpload}>
          <Upload aria-hidden />
          Use your own contract
          <span className="ms-auto text-xs font-normal text-muted-foreground">PDF, Word, text or scan</span>
        </Button>
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
                {real.length > 0 ? (
                  <>
                    <SelectGroup>
                      <SelectLabel>Real contracts (public sources)</SelectLabel>
                      {real.map((c) => (
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
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="tabular">{plural(selected.clauses, "clause")}</span>
              <LangChips languages={selected.languages} />
              {selected.ocr ? (
                <span className="inline-flex items-center gap-1">
                  <ScanText className="size-3.5" aria-hidden />
                  Scan, OCR {Math.round(selected.ocr.mean_conf ?? 0)}%
                </span>
              ) : null}
            </div>
            {selected.ocr?.doubt ? <p className="text-xs font-medium text-escalate">{selected.ocr.doubt}.</p> : null}
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
          Nothing is sent to the counterparty without approval.
        </p>
      </CardContent>
    </Card>
  )
}
