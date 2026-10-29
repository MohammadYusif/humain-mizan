"""Per-run review state and the deterministic scoring/routing. The model never decides the route.

Approve requires positive evidence of coverage, not just an empty findings list: every page of the
contract was served, every clause was typed in the clause map, the core clauses exist, nothing is
unclear, no finding contradicts its clause's declared type, and no clause tries to instruct the reviewer.
"""

from dataclasses import dataclass, field

from .contracts import Contract, find_injection, paginate
from .playbook import BY_ID, PLAYBOOK
from .tripwires import Tripwire, scan

WEIGHT = {"critical": 40, "major": 15, "minor": 3}
MIN_CONFIDENCE = 0.6
OTHER, UNCLEAR = "Other", "Unclear"
VALID_TYPES = sorted({r.clause_type for r in PLAYBOOK} | {OTHER, UNCLEAR})
# A contract without these cannot be approved automatically: absence is not compliance.
REQUIRED_TYPES = ("Limitation of liability", "Governing law and dispute forum")


@dataclass
class Finding:
    clause_id: str
    rule_id: str
    severity: str
    quote: str
    issue: str
    redline: str
    confidence: float


@dataclass
class Review:
    contract: Contract
    pages: list[list[str]] = field(default_factory=list)
    served: set[int] = field(default_factory=set)
    clause_map: dict[str, list[str]] | None = None
    injected: list[str] = field(default_factory=list)
    findings: dict[tuple[str, str], Finding] = field(default_factory=dict)
    tripwires: list[Tripwire] = field(default_factory=list)
    # (clause_id, rule_id) -> {"reason", "quote"}: red flags the model explicitly judged compliant
    cleared: dict[tuple[str, str], dict[str, str]] = field(default_factory=dict)
    route: str | None = None
    risk_score: int | None = None
    rendered: bool = False  # render_outputs ran
    acted: bool = False  # the route's follow-up action (send / escalate) passed its gate

    @classmethod
    def start(cls, contract: Contract) -> "Review":
        return cls(
            contract,
            pages=paginate(contract),
            injected=find_injection(contract),
            tripwires=scan(contract),
        )

    def clear(self, clause_id: str, rule_id: str, reason: str, quote: str) -> None:
        self.cleared[(clause_id, rule_id)] = {"reason": reason, "quote": quote}
        self.route = None

    def tripwire_status(self) -> list[dict]:
        """Major red flags are resolved by a finding for the rule (on this clause or, for bilingual
        twins, any clause) or by an explicit clearance; critical ones are never resolvable."""
        recorded = {f.rule_id for f in self.findings.values()}
        out = []
        for t in self.tripwires:
            if t.critical:
                status = "critical"
            elif t.rule_id in recorded:
                status = "recorded"
            elif (t.clause_id, t.rule_id) in self.cleared:
                status = "cleared"
            else:
                status = "unresolved"
            out.append(
                {
                    "clause_id": t.clause_id,
                    "rule_id": t.rule_id,
                    "critical": t.critical,
                    "match": t.match,
                    "status": status,
                }
            )
        return out

    def add(self, f: Finding) -> None:
        self.findings[(f.clause_id, f.rule_id)] = f  # same clause+rule overwrites
        self.route = None  # any new finding invalidates a previous score

    def set_map(self, clause_map: dict[str, list[str]]) -> None:
        self.clause_map = clause_map
        self.route = None

    def not_ready(self) -> str | None:
        if len(self.served) < len(self.pages):
            return f"read every page first: {len(self.served)} of {len(self.pages)} served (get_clauses)"
        if self.clause_map is None:
            return "call submit_clause_map first"
        return None


def score(review: Review) -> dict:
    """escalate: critical finding, mismatched finding, unclear/missing core clause, suspected injection,
    a major finding that is low-confidence / has no redline, a critical red flag, or a major red flag
    the model neither recorded nor cleared. negotiate: confident major findings.
    approve: full coverage, nothing above minor, and every red flag resolved."""
    if (err := review.not_ready()) is not None:
        raise ValueError(err)
    cmap = review.clause_map or {}
    fs = list(review.findings.values())
    counts = {s: sum(f.severity == s for f in fs) for s in WEIGHT}
    escalate: list[str] = []
    if counts["critical"]:
        escalate.append(f"{counts['critical']} critical finding(s): never auto-approved")
    mismatched = [
        f"{f.rule_id}@{f.clause_id}"
        for f in fs
        if BY_ID[f.rule_id].clause_type not in cmap.get(f.clause_id, [])
    ]
    if mismatched:
        escalate.append(
            f"finding(s) filed under a rule that does not match the clause type: {mismatched}"
        )
    unclear = [cid for cid, ts in cmap.items() if UNCLEAR in ts]
    if unclear:
        escalate.append(f"clause(s) the reviewer could not classify: {unclear}")
    present = {t for ts in cmap.values() for t in ts}
    missing = [t for t in REQUIRED_TYPES if t not in present]
    if missing:
        escalate.append(f"required clause(s) missing from the contract: {missing}")
    if review.injected:
        escalate.append(
            f"clause(s) contain instructions aimed at an AI reviewer (untrusted): {review.injected}"
        )
    if any(
        f.severity == "major" and (f.confidence < MIN_CONFIDENCE or not f.redline.strip())
        for f in fs
    ):
        escalate.append("a major finding is low-confidence or has no proposed redline")
    trip = review.tripwire_status()
    critical_flags = [f"{t['rule_id']}@{t['clause_id']}" for t in trip if t["status"] == "critical"]
    if critical_flags:
        escalate.append(f"deterministic red flag(s) that always need a lawyer: {critical_flags}")
    unresolved = [f"{t['rule_id']}@{t['clause_id']}" for t in trip if t["status"] == "unresolved"]
    if unresolved:
        escalate.append(f"red flag(s) the reviewer neither recorded nor cleared: {unresolved}")

    if escalate:
        route, reasons = "escalate", escalate
    elif counts["major"]:
        route, reasons = "negotiate", [f"{counts['major']} major finding(s) with playbook redlines"]
    else:
        route, reasons = "approve", ["full coverage and no findings above minor"]
    review.route = route
    review.risk_score = min(100, sum(WEIGHT[f.severity] for f in fs))
    return {
        "doc_id": review.contract.doc_id,
        "risk_score": review.risk_score,
        "counts": counts,
        "route": route,
        "reasons": reasons,
        "injected": review.injected,
        "tripwires": trip,
    }


def severity_of(rule_id: str) -> str:
    return BY_ID[rule_id].severity
