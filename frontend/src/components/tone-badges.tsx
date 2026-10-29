import { cn } from "cn"

import { Badge } from "@/components/ui/badge"
import type { Route, Severity } from "@/lib/api"
import { ROUTE_LABEL } from "@/lib/format"
import { ROUTE_ICON, ROUTE_TONE, SEVERITY_TONE } from "@/lib/tones"

export function RouteBadge({ route, className }: { route: Route; className?: string }) {
  const Icon = ROUTE_ICON[route]
  return (
    <Badge variant="outline" className={cn("gap-1 rounded-md font-semibold", ROUTE_TONE[route].badge, className)}>
      <Icon data-icon="inline-start" aria-hidden />
      {ROUTE_LABEL[route]}
    </Badge>
  )
}

export function SeverityBadge({ severity, className }: { severity: Severity; className?: string }) {
  return (
    <Badge
      variant="outline"
      className={cn("gap-1.5 rounded-md text-[0.7rem] font-semibold", SEVERITY_TONE[severity].badge, className)}
    >
      <span aria-hidden className={cn("size-1.5 rounded-[1px]", SEVERITY_TONE[severity].dot)} />
      {severity[0].toUpperCase() + severity.slice(1)}
    </Badge>
  )
}
