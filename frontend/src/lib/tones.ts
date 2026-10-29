import { CircleCheck, Handshake, ShieldAlert, type LucideIcon } from "lucide-react"

import type { Route, Severity } from "@/lib/api"

/** Tailwind class sets per semantic tone (tokens defined in index.css). Kept literal so Tailwind sees them. */
export const ROUTE_TONE: Record<Route, { badge: string; text: string; soft: string; border: string; stroke: string; bar: string }> = {
  approve: {
    badge: "bg-approve-soft text-approve border-approve/30",
    text: "text-approve",
    soft: "bg-approve-soft",
    border: "border-approve/40",
    stroke: "stroke-approve",
    bar: "bg-approve",
  },
  negotiate: {
    badge: "bg-negotiate-soft text-negotiate border-negotiate/30",
    text: "text-negotiate",
    soft: "bg-negotiate-soft",
    border: "border-negotiate/40",
    stroke: "stroke-negotiate",
    bar: "bg-negotiate",
  },
  escalate: {
    badge: "bg-escalate-soft text-escalate border-escalate/30",
    text: "text-escalate",
    soft: "bg-escalate-soft",
    border: "border-escalate/40",
    stroke: "stroke-escalate",
    bar: "bg-escalate",
  },
}

export const SEVERITY_TONE: Record<Severity, { badge: string; text: string; soft: string; borderStart: string; dot: string }> = {
  critical: {
    badge: "bg-critical-soft text-critical border-critical/30",
    text: "text-critical",
    soft: "bg-critical-soft",
    borderStart: "border-s-critical",
    dot: "bg-critical",
  },
  major: {
    badge: "bg-major-soft text-major border-major/30",
    text: "text-major",
    soft: "bg-major-soft",
    borderStart: "border-s-major",
    dot: "bg-major",
  },
  minor: {
    badge: "bg-minor-soft text-minor border-minor/30",
    text: "text-minor",
    soft: "bg-minor-soft",
    borderStart: "border-s-minor",
    dot: "bg-minor",
  },
}

export const ROUTE_ICON: Record<Route, LucideIcon> = {
  approve: CircleCheck,
  negotiate: Handshake,
  escalate: ShieldAlert,
}
