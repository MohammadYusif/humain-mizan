"""Data policy: which contracts may be sent to which model.

Every contract has a sensitivity label (public | internal | restricted). Every provider runs either
"local" (on infrastructure we control: a model on this machine or this network) or "external" (a
third-party API). The policy, enforced in code before any model sees a contract:

- restricted contracts are never sent to an external provider. With an external model they go
  straight to a lawyer, with no model call at all. With a local model they are reviewed, but a lawyer
  signs off every outcome (no automatic approval, no automatic send).
- internal contracts may go to an external provider only if HACK_MAX_EXTERNAL allows it ("internal",
  the default), and then with identifiers replaced by placeholders (HACK_REDACT_EXTERNAL, on by
  default). The placeholders are put back in everything people read and in what is sent out.
- public contracts (the bundled samples, the public real-world suite) go anywhere unchanged.

An upload with no label, or an unreadable one, is treated as the default (internal) or, if the label
file is damaged, as restricted: the policy fails closed.
"""

from __future__ import annotations

import ipaddress
import json
import re
from dataclasses import dataclass, field, replace
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from ..config import Settings
from .contracts import Clause, Contract

LEVELS = ("public", "internal", "restricted")
RANK = {lvl: i for i, lvl in enumerate(LEVELS)}
LABEL = {"public": "Public", "internal": "Internal", "restricted": "Restricted"}


# --- labels ---------------------------------------------------------------------------------------


def meta_path(contract_path: Path) -> Path:
    """Sidecar holding an uploaded contract's sensitivity label."""
    return contract_path.with_name(f"{contract_path.stem}.meta.json")


def write_label(contract_path: Path, level: str) -> None:
    if level not in LEVELS:
        raise ValueError(f"sensitivity must be one of {', '.join(LEVELS)}")
    meta_path(contract_path).write_text(json.dumps({"sensitivity": level}), encoding="utf-8")


def read_label(contract_path: Path) -> str | None:
    """The stored label; None when there is none; "restricted" when the file cannot be trusted."""
    p = meta_path(contract_path)
    if not p.is_file():
        return None
    try:
        level = json.loads(p.read_text(encoding="utf-8")).get("sensitivity")
    except (ValueError, AttributeError):
        return "restricted"
    return level if level in LEVELS else "restricted"


def contract_path(settings: Settings, doc_id: str) -> Path | None:
    for d in settings.contract_dirs():
        for ext in (".md", ".txt"):
            p = Path(d) / f"{doc_id}{ext}"
            if p.is_file():
                return p
    return None


def level_of(settings: Settings, doc_id: str) -> str:
    """A contract's sensitivity. Uploads default to HACK_DEFAULT_SENSITIVITY; the bundled samples
    and suites are public (synthetic, or published by their owners)."""
    path = contract_path(settings, doc_id)
    if path is None:
        return "restricted"  # nothing to send anyway; never loosen on a lookup failure
    if (label := read_label(path)) is not None:
        return label
    if path.parent.resolve() == Path(settings.uploads_dir).resolve():
        return settings.default_sensitivity
    return settings.sample_sensitivity


# --- where a provider runs ------------------------------------------------------------------------

_LOCAL_HOSTS = {"localhost", "host.docker.internal"}


def url_location(url: str) -> str:
    """ "local" for a model server on this machine or this network (loopback, private address, or
    a bare service name such as the compose service "ollama"); otherwise "external"."""
    host = (urlparse(url).hostname or "").lower()
    if not host:
        return "external"
    if host in _LOCAL_HOSTS or host.endswith(".localhost") or host.endswith(".internal"):
        return "local"
    try:
        ip = ipaddress.ip_address(host)
    except ValueError:
        return "local" if "." not in host else "external"
    return "local" if (ip.is_loopback or ip.is_private or ip.is_link_local) else "external"


def provider_location(provider: Any, settings: Settings) -> str:
    """Where a provider sends what it is given. HACK_PROVIDER_LOCATION overrides the detection (for
    a model hosted inside the organisation under a public host name); unknown means external."""
    if settings.provider_location in ("local", "external"):
        return settings.provider_location
    return getattr(provider, "location", "external")


# --- the decision ---------------------------------------------------------------------------------


@dataclass
class Decision:
    doc_id: str
    sensitivity: str
    location: str  # local | external
    allowed: bool
    redact: bool
    reason: str

    def record(self) -> dict[str, Any]:
        return {
            "doc_id": self.doc_id,
            "sensitivity": self.sensitivity,
            "location": self.location,
            "allowed": self.allowed,
            "redact": self.redact,
            "reason": self.reason,
        }


def decide(settings: Settings, doc_id: str, location: str) -> Decision:
    level = level_of(settings, doc_id)
    if location == "local":
        reason = "Reviewed by a model running inside your network"
        if level == "restricted":
            reason += "; restricted, so a lawyer signs off every outcome"
        return Decision(doc_id, level, location, True, False, reason)
    max_ext = settings.max_external if settings.max_external in ("public", "internal") else "public"
    if RANK[level] > RANK[max_ext]:
        return Decision(
            doc_id,
            level,
            location,
            False,
            False,
            f"{LABEL[level]} contract: the configured model is an external service, so it was not "
            "sent to any model. A lawyer reviews it.",
        )
    redact = level != "public" and settings.redact_external
    reason = "Sent to an external model"
    if redact:
        reason += " with names, contact details, account and ID numbers replaced by placeholders"
    return Decision(doc_id, level, location, True, redact, reason)


# --- redaction ------------------------------------------------------------------------------------

_ROLES_EN = (
    "Supplier|Customer|Client|Vendor|Provider|Service Provider|Contractor|Subcontractor|Licensor|"
    "Licensee|Company|Buyer|Seller|Purchaser|Consultant|Lessor|Lessee|Owner|Employer|Agency|"
    "Disclosing Party|Receiving Party|Recipient|Discloser|Distributor|Partner|Reseller|Bank"
)
# A party introduced by name and a defined role: Nimbus Cloud Ltd ("Supplier").
_PARTY_EN = re.compile(
    r"((?:[A-Z][A-Za-z0-9&'\-]*\.?,?\s+){0,7}[A-Z][A-Za-z0-9&'\-]*\.?)\s*\(\s*(?:the\s+)?[\"“]"
    rf"(?:{_ROLES_EN})[\"”]\s*\)"
)
# A company name by its legal suffix: Falcon Freight Systems Ltd, Meridian Advisory FZ-LLC.
_COMPANY_EN = re.compile(
    r"\b((?:[A-Z][A-Za-z0-9&'\-]*\s+){1,6}"
    r"(?:Ltd|Limited|LLC|FZ-LLC|FZE|FZCO|Inc|Incorporated|Corp|Corporation|Co|Company|GmbH|PLC|LLP|SA|AG|BV)\b\.?)"
)
# شركة النور للخدمات اللوجستية («العميل»)
_PARTY_AR = re.compile(
    r"((?:شركة|مؤسسة|وزارة|هيئة|مجموعة|مكتب|بنك|مصرف|جامعة|مستشفى|السادة|السيد)\s[^()«»\"\n،:؛]{2,90}?)"
    r"\s*\(\s*[«\"][^»\"\n]{1,30}[»\"]\s*\)"
)
_AR_FORM = re.compile(r"^شركة\s+(?:ذات|مساهمة|توصية|تضامن|شخص\s+واحد)")
_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("EMAIL", re.compile(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+")),
    ("IBAN", re.compile(r"\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]{4}){3,7}(?:[ ]?[A-Z0-9]{1,4})?\b")),
    (
        "PHONE",
        re.compile(
            r"(?<![\w+])(?:\+|00)\d{1,3}[\s-]?\d(?:[\s-]?\d){6,11}\b|\b05\d(?:[\s-]?\d){7}\b"
        ),
    ),
    # Saudi VAT number (15 digits, starts and ends with 3), then national ID / Iqama / CR (10 digits)
    ("VAT", re.compile(r"(?<!\d)3\d{13}3(?!\d)")),
    ("ID", re.compile(r"(?<![\d,.])[12457]\d{9}(?!\d|[,.]\d)")),
]
_LEADING = re.compile(r"^(?:between|and|by|of|with|from|to|is|this|that|the)\s+", re.I)
_SUFFIX = re.compile(
    r"\s+(?:Pte\.?\s+)?(?:Ltd|Limited|LLC|FZ-LLC|FZE|FZCO|Inc|Incorporated|Corp|Corporation|Co|"
    r"Company|GmbH|PLC|LLP|SA|AG|BV)\.?$"
)


def _aliases(name: str) -> list[str]:
    """English short forms: the name without its legal suffix, and a hyphenated first word
    ("Al-Noor"), which is distinctive enough not to hit ordinary words."""
    out = []
    base = _SUFFIX.sub("", name).strip()
    if base != name and len(base) >= 4:
        out.append(base)
    first = name.split()[0] if name.split() else ""
    if "-" in first and len(first) >= 5 and first not in out:
        out.append(first)
    return out


@dataclass
class Redactor:
    """Replaces identifiers with numbered placeholders, the same way every time for the same text,
    and puts them back. Amounts, dates and durations are left alone: the review needs them."""

    mapping: dict[str, str] = field(default_factory=dict)  # original -> placeholder

    @classmethod
    def for_contract(cls, contract: Contract) -> Redactor:
        r = cls()
        texts = [contract.title, *(c.text for c in contract.clauses)]
        parties: list[str] = []
        for t in texts:
            for m in _PARTY_EN.finditer(t):
                name = _LEADING.sub("", m.group(1).strip().rstrip(","))
                if len(name) >= 4 and name not in parties:
                    parties.append(name)
            for m in _PARTY_AR.finditer(t):
                name = m.group(1).strip()
                # "شركة ذات مسؤولية محدودة ..." describes the company's form; it is not a name
                if _AR_FORM.match(name):
                    continue
                if name not in parties:
                    parties.append(name)
            for m in _COMPANY_EN.finditer(t):
                name = _LEADING.sub("", m.group(1).strip())
                if len(name) >= 4 and not any(name in p or p in name for p in parties):
                    parties.append(name)
        for i, name in enumerate(parties, 1):
            r.mapping[name] = f"[PARTY-{i}]"
        # Short forms the same contract uses for a party ("Al-Noor Logistics", "Al-Noor Legal") get
        # a numbered variant of its placeholder, so the model sees they are the same party and the
        # text is restored exactly as it was written.
        for i, name in enumerate(parties, 1):
            n = 0
            for alias in _aliases(name):
                if alias not in r.mapping and any(alias in t for t in texts):
                    n += 1
                    r.mapping[alias] = f"[PARTY-{i}.{n}]"
        counts: dict[str, int] = {}
        for t in texts:
            for kind, pat in _PATTERNS:
                # scan what is left after earlier kinds, so an IBAN is not also read as a phone
                for m in pat.finditer(r.redact(t)):
                    s = m.group(0).strip()
                    if s and s not in r.mapping:
                        counts[kind] = counts.get(kind, 0) + 1
                        r.mapping[s] = f"[{kind}-{counts[kind]}]"
        return r

    def __len__(self) -> int:
        return len(self.mapping)

    def redact(self, text: str) -> str:
        for orig in sorted(self.mapping, key=len, reverse=True):
            text = text.replace(orig, self.mapping[orig])
        return text

    def restore(self, text: str) -> str:
        for orig, ph in self.mapping.items():
            text = text.replace(ph, orig)
        return text

    def contract(self, c: Contract) -> Contract:
        """The contract as the external model sees it."""
        return replace(
            c,
            title=self.redact(c.title),
            clauses=[Clause(cl.id, cl.lang, self.redact(cl.text)) for cl in c.clauses],
        )

    def summary(self) -> dict[str, int]:
        out: dict[str, int] = {}
        for ph in self.mapping.values():
            kind, num = ph.strip("[]").rsplit("-", 1)
            if "." in num:  # a short form of a party already counted
                continue
            out[kind] = out.get(kind, 0) + 1
        return out


REDACTION_FILE = "redaction.json"


def save_mappings(run_dir: Path, mappings: dict[str, dict[str, str]]) -> None:
    """Per contract, original -> placeholder. Kept beside the run (never sent anywhere) so people
    see the real names again."""
    (Path(run_dir) / REDACTION_FILE).write_text(
        json.dumps(mappings, ensure_ascii=False), encoding="utf-8"
    )


def load_redactor(run_dir: Path, doc_id: str | None) -> Redactor | None:
    p = Path(run_dir) / REDACTION_FILE
    if doc_id is None or not p.is_file():
        return None
    try:
        mapping = json.loads(p.read_text(encoding="utf-8")).get(doc_id)
    except (ValueError, AttributeError):
        return None
    return Redactor(dict(mapping)) if mapping else None


def restore_view(value: Any, r: Redactor) -> Any:
    """Put the placeholders back in every string of a review view."""
    if isinstance(value, str):
        return r.restore(value)
    if isinstance(value, list):
        return [restore_view(v, r) for v in value]
    if isinstance(value, dict):
        return {k: restore_view(v, r) for k, v in value.items()}
    return value


NOTE = (
    "Names, contact details, account and ID numbers in this contract were replaced by placeholders such "
    "as [PARTY-1] or [EMAIL-1] before it was sent to you. Quote them exactly as shown; never guess the "
    "originals. Amounts, dates and durations are unchanged."
)
