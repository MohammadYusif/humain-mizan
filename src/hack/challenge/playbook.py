"""Contract playbook. Perspective: WE are the buyer/customer reviewing a supplier's paper.

Rules are illustrative demo defaults, NOT legal advice; a lawyer must validate them (incl. the KSA-specific
ones) before any real use. Severity is owned by the rule (code), not chosen by the model.
"""

import json
import os
from dataclasses import asdict, dataclass, replace
from pathlib import Path


@dataclass(frozen=True)
class Rule:
    id: str
    clause_type: str
    severity: str  # minor | major | critical
    required: str
    fallback: str
    hint: str


PLAYBOOK: tuple[Rule, ...] = (
    Rule(
        "LIAB-CAP",
        "Limitation of liability",
        "critical",
        "Each party's liability is capped, at no less than the fees paid/payable in the prior 12 months, and the "
        "cap is mutual.",
        "Uncapped liability only for confidentiality breach, fraud, wilful misconduct, death or personal injury.",
        "Critical if OUR liability is uncapped or the cap is one-sided against us / far below 12 months of fees. "
        "Uncapped liability limited to the carve-outs in the fallback is acceptable (not a finding).",
    ),
    Rule(
        "INDEMNITY",
        "Indemnity",
        "major",
        "Indemnities are mutual and limited to third-party claims (IP infringement, data breach, negligence).",
        "One-way supplier indemnity for IP infringement is acceptable.",
        "Major if we give a broad or first-party indemnity the supplier does not reciprocate.",
    ),
    Rule(
        "TERM-CONV",
        "Termination for convenience",
        "major",
        "Customer may terminate for convenience on <= 60 days' notice without penalty.",
        "Mutual termination for convenience on <= 90 days' notice.",
        "Major if only the supplier can terminate for convenience, or the customer has no such right on a "
        "term > 12 months.",
    ),
    Rule(
        "AUTO-RENEW",
        "Term and renewal",
        "major",
        "No auto-renewal, or auto-renewal for <= 12 months with a non-renewal notice window <= 30 days.",
        "Notice window up to 60 days.",
        "Major if renewal term > 12 months or notice window > 60 days.",
    ),
    Rule(
        "PAY-TERMS",
        "Payment terms",
        "major",
        "Customer pays undisputed invoices no sooner than 30 days after receipt; no prepayment above 50%.",
        "None: shorter terms or larger prepayments are not acceptable.",
        "Major if payment is due in fewer than 30 days or the supplier requires > 50% prepayment. Any term of "
        "30 days or longer (including 60, 90 or more) favours us and is not a finding.",
    ),
    Rule(
        "INTEREST",
        "Late payment charges",
        "major",
        "No interest-bearing late charges (riba); use a fixed administrative fee or compensation for actual loss.",
        "Fixed administrative fee <= 1% of the overdue amount, once.",
        "Major if late charges are expressed as interest or a recurring percentage per month/year.",
    ),
    Rule(
        "IP-OWN",
        "Intellectual property",
        "major",
        "Customer owns deliverables and customer data; supplier keeps pre-existing IP and licenses it to us.",
        "Supplier owns deliverables but grants an irrevocable, perpetual, royalty-free licence.",
        "Major if the supplier owns customer data or bespoke deliverables without a licence back.",
    ),
    Rule(
        "CONF-TERM",
        "Confidentiality term",
        "minor",
        "Confidentiality obligations survive 3-5 years after termination (trade secrets: as long as secret).",
        "Up to 7 years.",
        "Minor if the surviving period is shorter than 3 years or longer than 7 years, or perpetual without a "
        "trade-secret limit.",
    ),
    Rule(
        "GOV-LAW",
        "Governing law and dispute forum",
        "major",
        "Laws of the Kingdom of Saudi Arabia; Saudi courts or SCCA arbitration seated in Riyadh.",
        "Neutral law with arbitration (SCCA or ICC) seated in Riyadh.",
        "Major if foreign governing law is imposed (other than the fallback: neutral law with arbitration seated "
        "in Riyadh) OR an exclusive forum outside the Kingdom is imposed, even under Saudi law.",
    ),
    Rule(
        "DATA-PROT",
        "Data protection and residency",
        "major",
        "Personal data is processed per the Saudi PDPL, hosted in the Kingdom or transferred only with documented "
        "safeguards and prior notice; breach notification <= 72 hours.",
        "Cross-border transfer to listed regions with prior written consent.",
        "Major if the supplier may store or move personal data anywhere without notice or safeguards.",
    ),
    Rule(
        "NONCOMPETE",
        "Exclusivity and non-compete",
        "major",
        "No exclusivity or non-compete binding the customer.",
        "Scoped, <= 12 months, limited to the specific services.",
        "Major if broad or open-ended exclusivity binds the customer.",
    ),
    Rule(
        "LANG-PREC",
        "Language precedence",
        "major",
        "For bilingual contracts the Arabic text prevails (or the two are expressly consistent).",
        "English prevails only if an accurate Arabic translation is attached and checked.",
        "Major if English prevails with no reconciled Arabic text, or the two versions conflict on substance "
        "(then escalate: confidence is low).",
    ),
    Rule(
        "ASSIGN",
        "Assignment",
        "minor",
        "No assignment without the other party's prior written consent.",
        "Assignment to affiliates or successors on notice.",
        "Minor if the supplier may assign freely.",
    ),
)


def _with_policy(rules: tuple[Rule, ...]) -> tuple[Rule, ...]:
    """Another company's rules without code changes: HACK_PLAYBOOK names a JSON file of per-rule edits,
    e.g. {"PAY-TERMS": {"required": "...", "hint": "..."}}. A critical rule can never be relaxed."""
    path = os.environ.get("HACK_PLAYBOOK")
    if not path:
        return rules
    edits = json.loads(Path(path).read_text(encoding="utf-8"))
    out = []
    for r in rules:
        e = edits.get(r.id, {})
        unknown = set(e) - {"required", "fallback", "hint", "severity"}
        if unknown:
            raise ValueError(f"{r.id}: unknown fields {sorted(unknown)}")
        if r.severity == "critical" and e.get("severity", "critical") != "critical":
            raise ValueError(f"{r.id} is critical and cannot be relaxed")
        out.append(replace(r, **e))
    missing = set(edits) - {r.id for r in rules}
    if missing:
        raise ValueError(f"unknown rules in {path}: {sorted(missing)}")
    return tuple(out)


PLAYBOOK = _with_policy(PLAYBOOK)
BY_ID = {r.id: r for r in PLAYBOOK}


def as_dicts() -> list[dict]:
    return [asdict(r) for r in PLAYBOOK]
