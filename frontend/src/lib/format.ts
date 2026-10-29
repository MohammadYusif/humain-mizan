import type { DecisionKind, Lang, NeedsHuman, Route, Severity } from "@/lib/api"

const ARABIC = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/g

/** Language of a free-text string, for `lang=` (fonts, line-height). Direction itself is left to dir="auto". */
export function langOf(text: string): Lang {
  const ar = text.match(ARABIC)?.length ?? 0
  const latin = text.match(/[A-Za-z]/g)?.length ?? 0
  return ar > 0 && ar >= latin * 0.5 ? "ar" : "en"
}

export function usd(v: number | null | undefined): string {
  if (v == null) return "—"
  if (v === 0) return "$0.00"
  return v < 0.01 ? `$${v.toFixed(4)}` : `$${v.toFixed(3)}`
}

/** Cost with the provider's pricing in mind: an unpriced model shows "unpriced", never a fake $0.00. */
export function cost(v: number | null | undefined, priced: boolean | null | undefined): string {
  if (priced === false) return "unpriced"
  return usd(v)
}

export function seconds(v: number | null | undefined): string {
  if (v == null) return "—"
  if (v < 60) return `${v.toFixed(1)} s`
  const m = Math.floor(v / 60)
  return `${m} m ${Math.round(v - m * 60)} s`
}

export function tokens(v: number | null | undefined): string {
  if (v == null) return "—"
  return v >= 10_000 ? `${(v / 1000).toFixed(1)}k` : v.toLocaleString("en-US")
}

const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto", style: "short" })

export function relativeTime(epochSeconds: number, now = Date.now()): string {
  const diff = epochSeconds - now / 1000
  const abs = Math.abs(diff)
  if (abs < 45) return "just now"
  if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute")
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), "hour")
  return rtf.format(Math.round(diff / 86400), "day")
}

export const ROUTE_LABEL: Record<Route, string> = {
  approve: "Approve",
  negotiate: "Negotiate",
  escalate: "Escalate",
}

export const ROUTE_DESCRIPTION: Record<Route, string> = {
  approve: "Meets the playbook. Safe to sign without changes.",
  negotiate: "Major deviations with playbook redlines. Send the redlines to the counterparty.",
  escalate: "Critical risk or a gap the playbook cannot resolve. Needs a lawyer's decision.",
}

export const SEVERITY_ORDER: Severity[] = ["critical", "major", "minor"]

/** Pretty-print a tool payload: JSON strings are parsed and indented, anything else is shown as-is. */
export function prettyPayload(v: unknown): string {
  if (typeof v === "string") {
    const s = v.trim()
    if (s.startsWith("{") || s.startsWith("[")) {
      try {
        return JSON.stringify(JSON.parse(s), null, 2)
      } catch {
        return v
      }
    }
    return v
  }
  return JSON.stringify(v, null, 2)
}

export function contractTitle(title: string): { primary: string; secondary: string | null } {
  const parts = title.split(" | ")
  return parts.length > 1 ? { primary: parts[0], secondary: parts.slice(1).join(" | ") } : { primary: title, secondary: null }
}

export const NEEDS_HUMAN_LABEL: Record<NeedsHuman, string> = {
  legal_review: "Lawyer review",
  unrouted: "Full lawyer review",
  approve_send: "Approve send",
}

export const DECISION_LABEL: Record<DecisionKind, string> = {
  approve_contract: "Approved by legal",
  request_changes: "Changes requested",
  reject: "Rejected",
  send: "Sent to counterparty",
  discard: "Draft discarded",
}

/** Decisions made by the batch's auto-send policy rather than a person. */
export function byWorkflow(by: string | null | undefined): boolean {
  return !!by && by.startsWith("workflow")
}

/** An Inbox draft the server composed from the recorded redlines (the model wrote none). */
export function composedFromRedlines(text: string): boolean {
  return text.startsWith("Requested changes to")
}

export function isEvalRun(runId: string): boolean {
  return runId.startsWith("eval-")
}

export function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`
}

export function percent(v: number | null | undefined): string {
  return v == null ? "—" : `${Math.round(v * 1000) / 10}%`
}
