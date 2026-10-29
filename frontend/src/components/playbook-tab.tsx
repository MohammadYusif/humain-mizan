import { SeverityBadge } from "@/components/tone-badges"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { PlaybookRule } from "@/lib/api"
import { langOf } from "@/lib/format"

function Amendments({ items }: { items?: string[] }) {
  if (!items?.length) return null
  return (
    <div className="mt-2 flex flex-col gap-1 rounded-md border border-brass/40 bg-brass-soft/60 p-2 text-foreground">
      <span className="text-xs font-semibold text-brass-ink">Accepted by legal</span>
      {items.map((t) => (
        <p key={t} dir="auto" lang={langOf(t)} className="text-[0.8rem]">
          {t}
        </p>
      ))}
    </div>
  )
}

export function PlaybookTab({ rules }: { rules: PlaybookRule[] | null }) {
  if (!rules) {
    return (
      <div className="flex flex-col gap-2">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-14 w-full rounded-lg" />
        ))}
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-prose text-sm text-muted-foreground">
        The rules the agent reviews against. Severity belongs to the rule, so the model cannot soften it; the route is
        computed from these severities. Illustrative defaults for the demo, not legal advice.
      </p>

      <Card className="hidden p-0 md:flex">
        <Table className="table-fixed">
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead className="w-[11rem] ps-4">Rule</TableHead>
              <TableHead className="w-[6.5rem]">Severity</TableHead>
              <TableHead>Required position</TableHead>
              <TableHead>Acceptable fallback</TableHead>
              <TableHead className="hidden pe-4 xl:table-cell">Reviewer hint</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rules.map((r) => (
              <TableRow key={r.id} className="align-top">
                <TableCell className="ps-4 whitespace-normal">
                  <div className="font-mono text-[0.8rem] font-medium">{r.id}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">{r.clause_type}</div>
                </TableCell>
                <TableCell>
                  <SeverityBadge severity={r.severity} />
                </TableCell>
                <TableCell className="text-[0.8rem] leading-relaxed whitespace-normal">{r.required}</TableCell>
                <TableCell className="text-[0.8rem] leading-relaxed whitespace-normal text-muted-foreground">
                  {r.fallback}
                  <Amendments items={r.accepted_by_legal} />
                </TableCell>
                <TableCell className="hidden pe-4 text-[0.8rem] leading-relaxed whitespace-normal text-muted-foreground xl:table-cell">
                  {r.hint}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <ul className="flex flex-col gap-3 md:hidden">
        {rules.map((r) => (
          <li key={r.id} className="rounded-lg border bg-card p-4">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[0.8rem] font-medium">{r.id}</span>
              <SeverityBadge severity={r.severity} className="ms-auto" />
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">{r.clause_type}</p>
            <dl className="mt-3 flex flex-col gap-2.5 text-[0.8rem] leading-relaxed">
              <div>
                <dt className="text-[0.7rem] font-semibold text-muted-foreground">Required</dt>
                <dd>{r.required}</dd>
              </div>
              <div>
                <dt className="text-[0.7rem] font-semibold text-muted-foreground">Fallback</dt>
                <dd>
                  {r.fallback}
                  <Amendments items={r.accepted_by_legal} />
                </dd>
              </div>
              <div>
                <dt className="text-[0.7rem] font-semibold text-muted-foreground">Hint</dt>
                <dd className="text-muted-foreground">{r.hint}</dd>
              </div>
            </dl>
          </li>
        ))}
      </ul>
    </div>
  )
}
