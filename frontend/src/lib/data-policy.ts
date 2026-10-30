import type { DataPolicyConfig, Sensitivity } from "@/lib/api"

export const LEVEL_LABEL: Record<Sensitivity, string> = { public: "Public", internal: "Internal", restricted: "Restricted" }

const RANK: Record<Sensitivity, number> = { public: 0, internal: 1, restricted: 2 }

/** Whether a label is looser than what the contract's own text called for. Mizan never does this
 * on its own; a person can, and it is recorded. */
export function looserThan(level: Sensitivity | undefined, detected: Sensitivity | null | undefined): boolean {
  return Boolean(level && detected && RANK[level] < RANK[detected])
}

/** The detector's reasons as one clause: "has 2 party names; marked “Confidential”". */
export function reasonText(reasons: string[] | undefined): string {
  return (reasons ?? []).map((r) => r.charAt(0).toLowerCase() + r.slice(1)).join("; ")
}

/** Whether the configured model may read a contract with this label at all. */
export function blocked(level: Sensitivity | undefined, policy: DataPolicyConfig | null): boolean {
  if (!level || !policy || policy.location === "local") return false
  return level === "restricted" || (level === "internal" && policy.max_external === "public")
}

/** One sentence: where a contract with this label goes when someone presses Review. */
export function destination(level: Sensitivity | undefined, policy: DataPolicyConfig | null): string | null {
  if (!level || !policy) return null
  if (blocked(level, policy)) return "Not sent to any model: the configured model is external. It goes straight to a lawyer."
  if (policy.location === "local") {
    return level === "restricted"
      ? "Reviewed by the model inside your network. A lawyer signs off every outcome."
      : "Reviewed by the model inside your network."
  }
  if (level === "internal" && policy.redact_external)
    return "Sent to the external model with names, contact details, account and ID numbers replaced."
  return "Sent to the external model as written."
}
