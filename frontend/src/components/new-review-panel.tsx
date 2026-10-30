import { Lock, LoaderCircle, Play, ScanText, Send, Upload, UserLock } from "lucide-react"

import { LabelSuggestion, SensitivityBadge } from "@/components/data-policy"
import { useDataPolicy } from "@/hooks/use-data-policy"
import { blocked, destination } from "@/lib/data-policy"

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
import type { ContractSummary, LabelSignOff, Lang, Sensitivity } from "@/lib/api"
import { contractTitle, langOf, plural } from "@/lib/format"

/** "2026-10-30T18:03:11+00:00" -> "21:03" in the viewer's time. */
function clock(iso: string) {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
}

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
  /** What the workspace is showing for the picked contract, e.g. its latest review. */
  note?: string | null
  /** Change an uploaded contract's label. */
  onRelabel: (docId: string, level: Sensitivity, signOff?: LabelSignOff) => void
}

function ContractOption({ c }: { c: ContractSummary }) {
  return (
    <SelectItem value={c.doc_id} className="py-1.5">
      <span className="flex w-full min-w-0 items-center gap-2">
        <span className="truncate font-mono text-[0.8rem]">{c.doc_id}</span>
        <LangChips languages={c.languages} />
        {c.ocr ? <ScanText className="size-3.5 text-muted-foreground" aria-label="Scan read by OCR" /> : null}
        <span className="text-xs text-muted-foreground tabular">{c.clauses} cl.</span>
        {c.sensitivity && c.sensitivity !== "public" ? <SensitivityBadge level={c.sensitivity} /> : null}
      </span>
    </SelectItem>
  )
}

export function NewReviewPanel({ contracts, docId, onDocChange, onReview, onUpload, busy, note, onRelabel }: Props) {
  const policy = useDataPolicy()
  const samples = contracts?.filter((c) => c.source === "sample" || c.source === "held-out") ?? []
  const real = contracts?.filter((c) => c.source === "real") ?? []
  const uploads = contracts?.filter((c) => c.source === "upload") ?? []
  const selected = contracts?.find((c) => c.doc_id === docId) ?? null
  const title = selected ? contractTitle(selected.title) : null
  const level = selected?.sensitivity
  const toLawyer = blocked(level, policy)
  // Someone else's review holds this contract (our own shows as busy instead).
  const held = selected?.in_review ?? null
  const heldElsewhere = Boolean(held) && !busy
  // Your role may not open it: a Restricted contract opens only for legal.
  const locked = selected?.readable === false
  const reviewed = selected?.last_review ?? null

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

        {selected && locked ? (
          <p className="flex items-start gap-2 rounded-md border border-escalate/40 bg-escalate-soft px-2.5 py-2 text-xs text-foreground">
            <Lock className="mt-px size-3.5 shrink-0 text-escalate" aria-hidden />
            <span>
              <span className="font-semibold">Restricted.</span> Only Legal can open this contract and its reviews. Ask
              Legal if you need its outcome.
            </span>
          </p>
        ) : null}
        {selected && title && !locked ? (
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
            {level ? (
              <div className="mt-1 flex flex-col gap-1.5 rounded-md border bg-background/60 px-2.5 py-2">
                {selected.source === "upload" ? (
                  <LabelSuggestion
                    c={selected}
                    policy={policy}
                    busy={busy}
                    compact
                    bare
                    onRestore={(l) => onRelabel(selected.doc_id, l)}
                    onChange={(l, signOff) => onRelabel(selected.doc_id, l, signOff)}
                  />
                ) : (
                  <>
                    <div className="flex items-center gap-2">
                      <SensitivityBadge level={level} />
                      <span className="text-xs text-muted-foreground">Sample label</span>
                    </div>
                    {destination(level, policy) ? (
                      <p className={toLawyer ? "text-xs font-medium text-escalate" : "text-xs text-muted-foreground"}>
                        {destination(level, policy)}
                      </p>
                    ) : null}
                  </>
                )}
              </div>
            ) : null}
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

        {heldElsewhere && held ? (
          <p className="flex items-start gap-2 rounded-md border border-negotiate/40 bg-negotiate-soft px-2.5 py-2 text-xs text-foreground">
            <UserLock className="mt-px size-3.5 shrink-0 text-negotiate" aria-hidden />
            <span>
              Being reviewed by <span className="font-semibold">{held.by ?? "someone"}</span> since {clock(held.since)}. One
              review at a time per contract: you can review it, or change its label, when theirs ends.
            </span>
          </p>
        ) : null}
        <Button
          size="lg"
          variant={reviewed && !busy ? "outline" : "default"}
          className="h-10 w-full text-sm"
          disabled={!docId || busy || heldElsewhere || locked}
          onClick={onReview}
        >
          {busy ? <LoaderCircle className="animate-spin" aria-hidden /> : toLawyer ? <Send aria-hidden /> : <Play aria-hidden />}
          {busy ? "Reviewing…" : reviewed ? "Review again" : toLawyer ? "Send to a lawyer" : "Review contract"}
        </Button>
        <p className="text-xs leading-relaxed text-muted-foreground">
          {note ?? "Nothing is sent to the counterparty without approval."}
        </p>
      </CardContent>
    </Card>
  )
}
