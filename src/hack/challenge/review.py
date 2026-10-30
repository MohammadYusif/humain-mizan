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
LIAB_TYPE = "Limitation of liability"
REQUIRED_TYPES = (LIAB_TYPE, "Governing law and dispute forum")
# Text read from a scan is only trusted for automatic action when OCR was confident: a misread word
# ("limited" read as "unlimited", a dropped "not") can hide or invent a risky clause.
# Calibrated on the sample scans with Tesseract's best models: a clean 200-dpi Arabic scan reads at
# ~87% mean with ~8% of words below 60; a blurry phone photo at ~64% with ~42%.
OCR_MIN_CONF = 80.0
OCR_MAX_LOW_SHARE = 0.15


def ocr_doubt(source: dict | None) -> str | None:
    """Why scanned text is not reliable enough to act on without a lawyer, or None."""
    if not source:
        return None
    if source.get("kind") == "unread":
        pages = ", ".join(str(p) for p in source.get("pages_unread", []))
        return f"PDF pages without readable text could not be checked (page {pages}): a lawyer must read them"
    if source.get("kind") != "ocr":
        return "Text came from an unrecognised source"
    mean, low = source.get("mean_conf", 0.0), source.get("low_conf_share", 1.0)
    if mean >= OCR_MIN_CONF and low <= OCR_MAX_LOW_SHARE:
        return None
    return (
        f"Scanned text read with low OCR confidence ({mean:.0f}% average, {low:.0%} of words "
        "uncertain): a lawyer must check it against the original"
    )


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
    # {"clause_id", "quote"}: the verified words that cap OUR liability (required to approve/negotiate)
    cap_evidence: dict[str, str] | None = None

    def confirm_cap(self, clause_id: str, quote: str) -> None:
        self.cap_evidence = {"clause_id": clause_id, "quote": quote}
        self.route = None

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

    def report_instruction(self, clause_id: str) -> None:
        """The model's own report of an instruction aimed at it: a second detector next to the
        regex, which cannot know every wording (or language) an injection can take."""
        if clause_id not in self.injected:
            self.injected.append(clause_id)
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
        n = counts["critical"]
        escalate.append(f"{n} critical {_pl(n, 'finding')}: never approved automatically")
    mismatched = [
        f"{f.rule_id}@{f.clause_id}"
        for f in fs
        if BY_ID[f.rule_id].clause_type not in cmap.get(f.clause_id, [])
    ]
    if mismatched:
        escalate.append(
            f"{_pl(len(mismatched), 'Finding')} filed under a rule that does not match the clause type: "
            f"{_ls(mismatched)}"
        )
    unclear = [cid for cid, ts in cmap.items() if UNCLEAR in ts]
    if unclear:
        escalate.append(
            f"{_pl(len(unclear), 'Clause')} the reviewer could not classify: {_ls(unclear)}"
        )
    present = {t for ts in cmap.values() for t in ts}
    missing = [t for t in REQUIRED_TYPES if t not in present]
    if missing:
        escalate.append(
            f"Required {_pl(len(missing), 'clause')} missing from the contract: {_ls(missing)}"
        )
    # A clause typed "limitation of liability" is not enough: the words that cap OUR liability must be
    # quoted (a supplier-only cap or the supplier's own liability clause does not count). Without
    # them, nothing shows our exposure is limited. Not repeated when a LIAB-CAP issue is already flagged.
    if LIAB_TYPE not in missing and not any(f.rule_id == "LIAB-CAP" for f in fs):
        ev = review.cap_evidence
        if ev is None:
            escalate.append(
                "No wording that caps our liability was confirmed: a lawyer must decide"
            )
        elif LIAB_TYPE not in cmap.get(ev["clause_id"], []):
            escalate.append(
                f"The cap quoted for our liability ({ev['clause_id']}) is not in a clause typed as "
                "limitation of liability"
            )
    if (doubt := ocr_doubt(review.contract.source)) is not None:
        escalate.append(doubt)
    if review.injected:
        escalate.append(
            f"{_pl(len(review.injected), 'Clause')} with instructions aimed at an AI reviewer (untrusted): "
            f"{_ls(review.injected)}"
        )
    if any(
        f.severity == "major" and (f.confidence < MIN_CONFIDENCE or not f.redline.strip())
        for f in fs
    ):
        escalate.append("A major finding is low-confidence or has no proposed redline")
    trip = review.tripwire_status()
    critical_flags = [f"{t['rule_id']}@{t['clause_id']}" for t in trip if t["status"] == "critical"]
    if critical_flags:
        escalate.append(
            f"Deterministic red {_pl(len(critical_flags), 'flag')} that always {'goes' if len(critical_flags) == 1 else 'go'} to a lawyer: "
            f"{_ls(critical_flags)}"
        )
    unresolved = [f"{t['rule_id']}@{t['clause_id']}" for t in trip if t["status"] == "unresolved"]
    if unresolved:
        escalate.append(
            f"Red {_pl(len(unresolved), 'flag')} the reviewer neither recorded nor cleared: {_ls(unresolved)}"
        )

    if escalate:
        route, reasons = "escalate", escalate
    elif counts["major"]:
        n = counts["major"]
        route, reasons = "negotiate", [f"{n} major {_pl(n, 'finding')} with playbook redlines"]
    else:
        route, reasons = "approve", ["Full coverage and no findings above minor"]
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
        "source": review.contract.source,
        "cap_evidence": review.cap_evidence,
    }


def _pl(n: int, word: str) -> str:
    """'finding' / 'findings': real plurals in text lawyers read, not 'finding(s)'."""
    return word if n == 1 else word + "s"


def _ls(items: list[str]) -> str:
    """Human-readable list for reasons shown to lawyers (not a Python repr)."""
    return ", ".join(items)


def severity_of(rule_id: str) -> str:
    return BY_ID[rule_id].severity
