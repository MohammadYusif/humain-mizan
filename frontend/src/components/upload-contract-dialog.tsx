import { CircleCheck, FileText, LoaderCircle, Play, ScanText, TriangleAlert, Upload, X } from "lucide-react"
import { cn } from "cn"
import { useId, useState, type DragEvent, type FormEvent } from "react"
import { toast } from "sonner"

import { LangChips } from "@/components/new-review-panel"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { api, errorMessage, type ContractSummary, type OcrSource } from "@/lib/api"
import { contractTitle, langOf, plural } from "@/lib/format"

const ACCEPT = [".pdf", ".docx", ".txt", ".md", ".png", ".jpg", ".jpeg", ".tif", ".tiff", ".webp"]
const MAX_BYTES = 5_000_000
const MAX_CHARS = 300_000 // same as the server's MAX_CHARS

function fileSize(n: number) {
  return n < 1_000_000 ? `${Math.max(1, Math.round(n / 1000))} KB` : `${(n / 1_000_000).toFixed(1)} MB`
}

/** How a scanned contract was read, and whether its text can be trusted for automatic action. */
export function OcrNote({ ocr }: { ocr: OcrSource }) {
  const pages = ocr.pages_ocr?.length ?? 0
  if (ocr.kind === "unread") {
    return (
      <div className="flex flex-col gap-1 text-sm">
        <span className="flex items-center gap-2 text-muted-foreground">
          <ScanText className="size-4 shrink-0" aria-hidden />
          {plural(ocr.pages_unread?.length ?? 0, "page")} had no readable text and could not be read here
        </span>
        {ocr.doubt ? <span className="font-medium text-escalate">{ocr.doubt}.</span> : null}
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-1 text-sm">
      <span className="flex items-center gap-2 text-muted-foreground">
        <ScanText className="size-4 shrink-0" aria-hidden />
        Read by OCR: {plural(pages, "page")}, {Math.round(ocr.mean_conf ?? 0)}% average word confidence
      </span>
      {ocr.doubt ? <span className="font-medium text-escalate">{ocr.doubt}.</span> : null}
    </div>
  )
}

function checkFile(f: File): string | null {
  const ext = f.name.slice(f.name.lastIndexOf(".")).toLowerCase()
  if (!ACCEPT.includes(ext)) return `“${f.name}” is not supported. Use a PDF, Word (.docx), .txt or .md file, or a scan (.png, .jpg, .tif).`
  if (f.size > MAX_BYTES) return `“${f.name}” is ${fileSize(f.size)}; the limit is 5 MB.`
  if (f.size === 0) return `“${f.name}” is empty.`
  return null
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAdded: (c: ContractSummary) => void
  onReviewNow: (docId: string) => void
  reviewBusy: boolean
}

export function UploadContractDialog({ open, onOpenChange, onAdded, onReviewNow, reviewBusy }: Props) {
  const inputId = useId()
  const [mode, setMode] = useState<"file" | "text">("file")
  const [file, setFile] = useState<File | null>(null)
  const [text, setText] = useState("")
  const [title, setTitle] = useState("")
  const [dragging, setDragging] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [added, setAdded] = useState<ContractSummary | null>(null)

  const reset = () => {
    setFile(null)
    setText("")
    setTitle("")
    setError(null)
    setAdded(null)
    setBusy(false)
  }

  const pick = (f: File | undefined) => {
    if (!f) return
    const problem = checkFile(f)
    setError(problem)
    setFile(problem ? null : f)
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    pick(e.dataTransfer.files[0])
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const form = new FormData()
    if (mode === "file") {
      if (!file) return setError("Choose a file first.")
      form.append("file", file)
    } else {
      if (!text.trim()) return setError("Paste the contract text first.")
      if (text.length > MAX_CHARS)
        return setError(
          `The text is ${text.length.toLocaleString("en-US")} characters; the limit is ${MAX_CHARS.toLocaleString("en-US")}. Split the contract or upload the file instead.`
        )
      form.append("text", text)
    }
    if (title.trim()) form.append("title", title.trim())
    setBusy(true)
    setError(null)
    try {
      const c = await api.uploadContract(form)
      setAdded(c)
      onAdded(c)
      toast.success("Contract added", { description: `${plural(c.clauses, "clause")} found in ${c.doc_id}` })
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const ready = mode === "file" ? file !== null : text.trim().length > 0
  const t = added ? contractTitle(added.title) : null

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o)
        if (!o) reset()
      }}
    >
      <DialogContent className="max-h-[92dvh] gap-5 overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl font-semibold">Review your own contract</DialogTitle>
          <DialogDescription>
            Mizan splits it into clauses and reviews it against the same playbook as the samples. Arabic, English and
            bilingual contracts all work. The text is stored on this server under data/uploads and sent to the
            configured model provider when you review it.
          </DialogDescription>
        </DialogHeader>

        {added && t ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-3 rounded-lg border border-approve/40 bg-approve-soft/60 p-4">
              <span className="flex items-center gap-2 text-sm font-semibold text-approve">
                <CircleCheck className="size-4" aria-hidden />
                Contract added and selected
              </span>
              <p dir="auto" lang={langOf(t.primary)} className="font-heading text-lg leading-snug font-semibold">
                {t.primary}
              </p>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="font-mono">{added.doc_id}</span>
                <span aria-hidden>·</span>
                <span className="tabular">{plural(added.clauses, "clause")}</span>
                <LangChips languages={added.languages} />
              </div>
              {added.ocr ? <OcrNote ocr={added.ocr} /> : null}
            </div>
            <p className="text-sm text-muted-foreground">
              If the clause count looks wrong, the text may need clearer numbering or paragraph breaks.
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Close
              </Button>
              <Button
                disabled={reviewBusy}
                onClick={() => {
                  onReviewNow(added.doc_id)
                  onOpenChange(false)
                  reset()
                }}
              >
                <Play aria-hidden />
                Review now
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-5">
            <Tabs
              value={mode}
              onValueChange={(v) => {
                setMode(v as "file" | "text")
                setError(null)
              }}
              className="gap-4"
            >
              <TabsList className="grid h-10! w-full grid-cols-2">
                <TabsTrigger value="file">Upload file</TabsTrigger>
                <TabsTrigger value="text">Paste text</TabsTrigger>
              </TabsList>

              <TabsContent value="file" className="flex flex-col gap-3">
                <label
                  htmlFor={inputId}
                  onDragOver={(e) => {
                    e.preventDefault()
                    setDragging(true)
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={onDrop}
                  className={cn(
                    "flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed px-4 py-8 text-center transition-colors",
                    "has-focus-visible:border-ring has-focus-visible:ring-3 has-focus-visible:ring-ring/50",
                    dragging ? "border-primary bg-primary/5" : "border-border bg-background/60 hover:bg-muted/60"
                  )}
                >
                  <Upload className="size-5 text-muted-foreground" aria-hidden />
                  <span className="text-sm font-semibold">
                    Drop a contract here, or <span className="text-primary underline underline-offset-4">browse</span>
                  </span>
                  <span className="text-xs text-muted-foreground">PDF, Word, .txt or .md, or a scan or photo · up to 5 MB</span>
                  <input
                    id={inputId}
                    type="file"
                    accept={ACCEPT.join(",")}
                    className="sr-only"
                    onChange={(e) => pick(e.target.files?.[0])}
                  />
                </label>
                {file ? (
                  <div className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2">
                    <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    <span dir="auto" className="min-w-0 flex-1 truncate text-sm font-medium">
                      {file.name}
                    </span>
                    <span className="text-xs text-muted-foreground tabular">{fileSize(file.size)}</span>
                    <Button type="button" variant="ghost" size="icon-xs" aria-label="Remove file" onClick={() => setFile(null)}>
                      <X aria-hidden />
                    </Button>
                  </div>
                ) : null}
                <p className="text-xs text-muted-foreground">
                  Scans, photos and Arabic PDFs are read by OCR on this server, a few seconds a page. If the scan reads
                  with low confidence, the contract always goes to a lawyer.
                </p>
              </TabsContent>

              <TabsContent value="text" className="flex flex-col gap-2">
                <Label htmlFor={`${inputId}-text`}>Contract text</Label>
                <Textarea
                  id={`${inputId}-text`}
                  dir="auto"
                  lang={text ? langOf(text) : undefined}
                  value={text}
                  onChange={(e) => {
                    setText(e.target.value)
                    setError(null)
                  }}
                  placeholder="Paste the full contract. Numbered clauses or one paragraph per clause work best."
                  className="field-sizing-fixed h-52 min-h-40 resize-y bg-background text-sm leading-relaxed [overflow-wrap:anywhere] sm:h-60"
                />
                <span
                  className={cn(
                    "text-end text-xs tabular",
                    text.length > MAX_CHARS ? "font-medium text-escalate" : "text-muted-foreground"
                  )}
                >
                  {text.length.toLocaleString("en-US")} / {MAX_CHARS.toLocaleString("en-US")} characters
                </span>
              </TabsContent>
            </Tabs>

            <div className="flex flex-col gap-2">
              <Label htmlFor={`${inputId}-title`}>
                Title <span className="font-normal text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id={`${inputId}-title`}
                dir="auto"
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value)
                  setError(null)
                }}
                placeholder="e.g. Cloud hosting agreement with Acme"
                className="bg-background"
              />
            </div>

            {error ? (
              <Alert className="border-escalate/40 bg-escalate-soft text-escalate">
                <TriangleAlert aria-hidden />
                <AlertDescription className="text-foreground/85">{error}</AlertDescription>
              </Alert>
            ) : null}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!ready || busy}>
                {busy ? <LoaderCircle className="animate-spin" aria-hidden /> : <Upload aria-hidden />}
                {busy ? "Reading contract…" : "Add contract"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
