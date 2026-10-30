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


def write_label(
    contract_path: Path, level: str, set_by: str = "person", detection: Detection | None = None
) -> None:
    """Store a label. set_by is "auto" (from detect_label) or "person"; what was detected is kept
    when a person changes the label, so the audit shows both."""
    if level not in LEVELS:
        raise ValueError(f"sensitivity must be one of {', '.join(LEVELS)}")
    meta: dict[str, Any] = {"sensitivity": level, "set_by": set_by}
    if detection is None:
        old = read_meta(contract_path)
        if old.get("detected") in LEVELS:
            meta["detected"], meta["reasons"] = old["detected"], old.get("reasons", [])
    else:
        meta["detected"], meta["reasons"] = detection.level, detection.reasons
    meta_path(contract_path).write_text(json.dumps(meta, ensure_ascii=False), encoding="utf-8")


def read_meta(contract_path: Path) -> dict[str, Any]:
    """The whole label record ({} when there is none or it cannot be read)."""
    p = meta_path(contract_path)
    try:
        meta = json.loads(p.read_text(encoding="utf-8")) if p.is_file() else {}
    except ValueError:
        return {}
    return meta if isinstance(meta, dict) else {}


def label_info(settings: Settings, doc_id: str) -> dict[str, Any]:
    """The label and how it was set, for the API and the audit record."""
    path = contract_path(settings, doc_id)
    meta = read_meta(path) if path is not None else {}
    set_by = meta.get("set_by") if meta.get("set_by") in ("auto", "person") else None
    if set_by is None and path is not None and read_label(path) is not None:
        set_by = "person"  # labels stored before detection existed were chosen by a person
    return {
        "sensitivity": level_of(settings, doc_id),
        "label_set_by": set_by,
        "label_detected": meta.get("detected") if meta.get("detected") in LEVELS else None,
        "label_reasons": [str(r) for r in meta.get("reasons", [])][:6],
    }


# --- detection ------------------------------------------------------------------------------------
# Runs on this server, before anything is sent anywhere: a model cannot be asked to label a contract
# without seeing it. Each rule gives a reason people can check. The highest level found wins.


@dataclass
class Detection:
    level: str
    reasons: list[str]


# A classification marking: a line that is only the marking ("CONFIDENTIAL", "سري للغاية"),
# or the marking after "Classification:". A clause heading such as "Confidential Information"
# is not a marking.
_MARK_RESTRICTED = (
    r"(?:strictly|highly|private\s+and)\s+confidential|confidential(?:\s+document)?|top\s+secret|"
    r"secret|restricted|classified|سري(?:\s+(?:للغاية|جدا|جداً|ومحظور))?|مقيد|محظور"
)
_MARK_INTERNAL = r"internal(?:\s+use)?(?:\s+only)?|for\s+internal\s+use(?:\s+only)?|للاستخدام\s+الداخلي(?:\s+فقط)?|داخلي"
_MARK_LINE = re.compile(rf"^(?:{_MARK_RESTRICTED}|{_MARK_INTERNAL})$", re.I)


def _plain(line: str) -> str:
    """A line without markdown or punctuation, for matching a marking."""
    return re.sub(r"\s+", " ", re.sub(r"[^\w\s:：-]", " ", line)).strip(" -_\t")


def is_marking(line: str) -> bool:
    """A line that is only a classification marking: never a contract's title or a clause."""
    p = _plain(line)
    return bool(p) and len(p) <= 40 and bool(_MARK_LINE.match(p))


_MARK_FIELD = re.compile(
    rf"(?:classification|security\s+classification|sensitivity|marking|التصنيف|درجة\s+السرية)"
    rf"\s*[:：]\s*({_MARK_RESTRICTED}|{_MARK_INTERNAL}|public|عام)\b",
    re.I,
)
_SAYS_CONFIDENTIAL = re.compile(
    r"\bthis\s+(?:document|agreement|contract)\s+(?:and\s+its\s+(?:contents|terms)\s+)?"
    r"(?:is|are)\s+(?:strictly\s+|highly\s+)?confidential\b"
    r"|\bthe\s+(?:terms|existence)\s+of\s+this\s+(?:agreement|contract)\s+(?:is|are)\s+"
    r"(?:strictly\s+)?confidential\b"
    r"|هذ[هاي]\s+(?:الوثيقة|الاتفاقية|العقد|المستند)\s+(?:سري|سرية)",
    re.I,
)
_UNDER_NDA = re.compile(
    r"\b(?:shared|disclosed|provided|delivered|furnished)\s+(?:to\s+\w+\s+)?(?:under|pursuant\s+to|"
    r"subject\s+to)\s+(?:the|a|an)\s+(?:[\w\s,]{0,40}?)?"
    r"(?:(?:non-disclosure|confidentiality)\s+agreement|NDA)\b"
    r"|\b(?:under|subject\s+to)\s+(?:an\s+|the\s+)?NDA\b"
    r"|بموجب\s+(?:اتفاقية|اتفاق)\s+(?:عدم\s+الإفصاح|السرية|عدم\s+الافصاح)",
    re.I,
)
_SENSITIVE = [
    (
        "health records",
        re.compile(
            r"\b(?:medical|health|patient)\s+(?:records?|data|information|files?|histor(?:y|ies))\b"
            r"|\bprotected\s+health\s+information\b|البيانات\s+الصحية|بيانات\s+صحية|السجلات?\s+الطبية|"
            r"المعلومات\s+الصحية|بيانات\s+المرضى|الملفات\s+الطبية",
            re.I,
        ),
    ),
    (
        "biometric or genetic data",
        re.compile(
            r"\b(?:biometric|genetic)\s+(?:data|information|records?|identifiers?)\b"
            r"|البيانات\s+(?:الحيوية|الجينية|الوراثية)|بيانات\s+(?:حيوية|جينية|وراثية)|البصمات",
            re.I,
        ),
    ),
    (
        "criminal records",
        re.compile(
            r"\bcriminal\s+(?:records?|histor(?:y|ies)|convictions?)\b|السوابق\s+الجنائية|السجل\s+الجنائي",
            re.I,
        ),
    ),
]
# As cards are written: one run of digits, or groups of four (Amex 4-6-5) with one separator
_CARD = re.compile(
    r"(?<![\d-])(?:\d{13,19}|\d{4}([ -])\d{4}\1\d{4}\1\d{4}(?:\1\d{3})?|\d{4}([ -])\d{6}\2\d{5})"
    r"(?![\d-])"
)
_TEMPLATE = re.compile(
    r"\[\s*(?:insert|name|party|company|date|address|amount|●|•|\.{3}|x+)[^\]]{0,40}\]|_{5,}|\.{8,}|"
    r"\{\{\s*\w+|<<\s*\w+|\[●\]|\[\s*\]|"
    r"\b(?:model|standard|template|sample|unified)\s+(?:form\s+of\s+)?(?:contract|agreement|form)\b|"
    r"نموذج\s+(?:عقد|اتفاقية)|العقد\s+الموحد|النموذج\s+الموحد",
    re.I,
)
_KIND = {
    "PARTY": ("party name", "party names"),
    "EMAIL": ("email address", "email addresses"),
    "PHONE": ("phone number", "phone numbers"),
    "IBAN": ("IBAN", "IBANs"),
    "VAT": ("VAT number", "VAT numbers"),
    "ID": ("ID or registration number", "ID or registration numbers"),
}


def _card(digits: str) -> bool:
    """A payment card number: a card network's length and prefix, and a valid check digit."""
    n = len(digits)
    shaped = (
        (n == 16 and digits[0] in "245")
        or (n == 15 and digits[:2] in ("34", "37"))
        or (n in (13, 19) and digits[0] == "4")
    )
    return shaped and _luhn(digits)


def _luhn(digits: str) -> bool:
    total = 0
    for i, ch in enumerate(reversed(digits)):
        d = int(ch) * (2 if i % 2 else 1)
        total += d - 9 if d > 9 else d
    return total % 10 == 0


def _quote(s: str) -> str:
    s = re.sub(r"\s+", " ", s).strip()
    return f"“{s[:1].upper()}{s[1:].lower()}”" if s.isascii() else f"«{s}»"


def _list(parts: list[str]) -> str:
    return parts[0] if len(parts) == 1 else f"{', '.join(parts[:-1])} and {parts[-1]}"


def detect_label(text: str, contract: Contract | None = None) -> Detection:
    """The label a contract's own text calls for. Never lower than internal unless the text is a
    blank template with no identifiers at all."""
    restricted: list[str] = []
    internal: list[str] = []
    for line in text.splitlines():
        if is_marking(line):
            ln = _plain(line)
            (restricted if re.fullmatch(_MARK_RESTRICTED, ln, re.I) else internal).append(
                f"Marked {_quote(ln)}"
            )
    for m in _MARK_FIELD.finditer(text):
        value = m.group(1)
        if re.fullmatch(_MARK_RESTRICTED, value, re.I):
            restricted.append(f"Classified {_quote(value)}")
        elif re.fullmatch(_MARK_INTERNAL, value, re.I):
            internal.append(f"Classified {_quote(value)}")
    if _SAYS_CONFIDENTIAL.search(text):
        restricted.append("Says the document itself is confidential")
    if _UNDER_NDA.search(text):
        restricted.append("Shared under a non-disclosure agreement")
    for what, pat in _SENSITIVE:
        if pat.search(text):
            restricted.append(f"Mentions sensitive personal data ({what})")
    for m in _CARD.finditer(text):
        if _card(re.sub(r"\D", "", m.group(0))):
            restricted.append("Has a payment card number")
            break
    if restricted:
        return Detection("restricted", list(dict.fromkeys(restricted)))

    found = Redactor.for_contract(contract).summary() if contract is not None else {}
    parts = [f"{found[k]} {_KIND[k][found[k] != 1]}" for k in _KIND if found.get(k)]
    if parts:
        internal.append(f"Has {_list(parts)}")
    if internal:
        return Detection("internal", list(dict.fromkeys(internal)))
    if _TEMPLATE.search(text):
        return Detection(
            "public", ["A blank template: no names, contact details or account numbers"]
        )
    return Detection(
        "internal", ["No names or account details found, but nothing shows the text is published"]
    )


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
