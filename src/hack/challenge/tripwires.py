"""Deterministic red-flag tripwires: a second, model-independent detector.

Each tripwire is a high-recall pattern (Arabic + English) for a playbook rule, matched against the
normalised clause text. At scoring time:
- a CRITICAL tripwire (uncapped customer liability, a liability cap far below 12 months) forces
  escalation no matter what the model recorded: no model can talk its way past it;
- a MAJOR tripwire must be resolved by the model: either a finding for that rule on that clause, or
  an explicit `clear_tripwire` with a reason and a verbatim quote showing why the clause is fine.
  Unresolved major tripwires force escalation.

So a contract is approved only if the model AND the patterns agree. Patterns are written against
`contracts.normalize()` output: lower-case, Western digits, Arabic alef/yeh/teh-marbuta unified.
"""

import re
from dataclasses import dataclass

from .contracts import Contract, normalize

_PARTY_US = r"(customer|client|licensee|buyer|purchaser)"
_PARTY_THEM = r"(supplier|licensor|consultant|vendor|provider|contractor)"
_AR_US = r"(المشتري|العميل|المرخص له|الطرف الثاني)"
_AR_THEM = r"(المرخص|المورد|الاستشاري|مقدم الخدمه|المقاول)"


@dataclass(frozen=True)
class Tripwire:
    clause_id: str
    rule_id: str
    critical: bool
    match: str


def _rx(*parts: str) -> re.Pattern[str]:
    return re.compile("|".join(f"(?:{p})" for p in parts))


# rule_id -> (critical?, pattern)
PATTERNS: list[tuple[str, bool, re.Pattern[str]]] = [
    (
        "LIAB-CAP",
        True,
        _rx(
            rf"{_PARTY_US}'?s?\s+(aggregate\s+|total\s+|entire\s+)?liabilit\w*[^.]{{0,160}}?\b(shall be|is|will be|remains)\s+unlimited",
            rf"مسؤوليه\s+{_AR_US}[^.]{{0,200}}?غير محدوده",
        ),
    ),
    (
        "INTEREST",
        False,
        _rx(
            r"\d+(\.\d+)?\s*%\)?\s*(per|a|each)\s+(month|annum|year|week|day)",
            r"\bcompound(ed|ing)?\b",
            r"\b(bears?|accrues?|charges?)\s+interest\b|\binterest\s+(at|rate|of \d)",
            r"فائده|فوائد",
            r"[%٪]\)?\s*(شهريا|سنويا|يوميا|اسبوعيا)",
        ),
    ),
    (
        "AUTO-RENEW",
        False,
        _rx(
            r"automatic(ally)?\s+renew|auto-?renew|renew\w*\s+(automatically|tacitly)",
            r"(تتجدد|يتجدد|تجدد)\w*\s+تلقائيا|التجديد التلقائي",
        ),
    ),
    (
        "GOV-LAW",
        False,
        _rx(
            r"governed by (and construed in accordance with )?(the )?laws? of (?!(the )?(kingdom of )?saudi arabia|the kingdom\b|ksa\b)",
            r"courts? of (?!(the )?(kingdom|saudi|riyadh))[a-z ,]{2,40}(shall )?have exclusive jurisdiction",
            r"(لقوانين|لقانون|قوانين|قانون)\s+(ولايه|انجلترا|انكلترا|دبي|سنغافوره|نيويورك|ديلاوير|فرنسا|الولايات المتحده)",
            r"محاكم\s+(لندن|دبي|نيويورك|سنغافوره|ديلاوير|باريس)",
        ),
    ),
    (
        "DATA-PROT",
        False,
        _rx(
            r"(data|personal)[^.]{0,160}(any data cent(re|er)|anywhere|worldwide|any (country|jurisdiction|location|region) (selected|chosen|it|of)|without (prior )?notice)",
            r"بيانات[^.]{0,220}(اي دوله|اي مكان|حول العالم|دون اشعار)",
        ),
    ),
    (
        "TERM-CONV",
        False,
        _rx(
            rf"{_PARTY_US} may (only )?terminate[^.]{{0,60}}\bonly\b",
            rf"{_PARTY_US} (shall have no|has no|may not) (right to )?terminate",
            rf"لا يجوز\s+(لل)?{_AR_US[1:-1].replace('|', '|لل')}\)?\s*(انهاء|فسخ)",
            r"(للعميل|للمشتري|للمرخص له)\s+(انهاء|فسخ)[^.]{0,60}(?<!\w)(الا|فقط)(?!\w)",
        ),
    ),
    (
        "NONCOMPETE",
        False,
        _rx(
            r"exclusiv(e|ity)\s+(supplier|provider|dealing|arrangement|basis|purchas\w*|right)",
            r"on an exclusive basis|\bexclusivity\b|non-?compet\w*",
            r"حصري|الحصريه|عدم المنافسه|عدم التعاقد مع اي مورد اخر",
        ),
    ),
    (
        "IP-OWN",
        False,
        _rx(
            rf"{_PARTY_THEM} shall own",
            rf"shall (vest|belong) (in|to) (the )?{_PARTY_THEM}",
            rf"تؤول\s+الي\s+{_AR_THEM}\s+ملكيه",
            rf"ملكيه[^.]{{0,80}}(لل{_AR_THEM[1:-1].replace('|', '|لل')})",
        ),
    ),
    (
        "LANG-PREC",
        False,
        _rx(
            r"english (version|text|language)[^.]{0,40}(shall )?(prevail|govern|control)",
            r"(النص|النسخه|اللغه) الانجليزي\w*[^.]{0,40}(يسود|تسود|المعتمد\w*|يعتد)",
            r"(يسود|تسود|يعتد ب)\w*\s+(النص|النسخه) الانجليزي",
        ),
    ),
    (
        "INDEMNITY",
        False,
        _rx(
            rf"{_PARTY_US} shall (indemnify|hold harmless)",
            rf"يلتزم\s+{_AR_US}\s+بتعويض",
        ),
    ),
]

_MONTHS_CAP = re.compile(
    r"liabilit\w*[^.]{0,200}?\(?(\d+)\)?\s+months?\s+(preceding|prior|before)|مسؤوليه[^.]{0,200}?\((\d+)\)\s*(شهر|اشهر)"
)
_PAY_CONTEXT = re.compile(r"\b(pay|paid|payment|invoice)\w*|يدفع|سداد|الدفع|فاتور")
_PAY_DAYS = re.compile(
    r"within\s+(?:[a-z-]+\s+){0,3}\(?(\d+)\)?\s+(?:calendar\s+|business\s+)?days|خلال\s+[^()]{0,30}\((\d+)\)\s*(يوما|ايام|يوم)"
)
_PREPAY = re.compile(
    r"(\d+)\s*%\)?[^.]{0,80}(in advance|advance payment|prepay\w*|upfront|up-front|upon signing|on signing)"
    r"|(in advance|advance payment|prepayment|upfront)[^.]{0,60}?\(?(\d+)\s*%"
    r"|مقدم\w*[^.]{0,80}?\((\d+)\s*[%٪]\)|\((\d+)\s*[%٪]\)[^.]{0,60}مقدم"
)


_NEGATION = re.compile(
    r"(\b(not|no|never|without|non)\b|(^|\s)و?(لا|لن|دون|بدون|غير|عدم))[\s\w-]{0,12}$"
)
_LATE_CONTEXT = re.compile(r"\b(late|overdue|unpaid|arrears)\b|تاخر|متاخر|سداد")
_DURATION = re.compile(r"\(?(\d+)\)?\s*(years?|months?|days?|سنه|سنوات|شهر|اشهر|يوم|ايام)")
# Rules whose pattern alone is too broad: only trip when the clause context also fits.
_NEEDS = {"INTEREST": _LATE_CONTEXT}


def _first_int(m: re.Match[str]) -> int | None:
    return next((int(g) for g in m.groups() if g and g.isdigit()), None)


def _negated(text: str, start: int) -> bool:
    """'does not renew automatically', 'without interest', 'لا تتجدد تلقائيا', 'غير حصري'."""
    return bool(_NEGATION.search(text[max(0, start - 30) : start]))


def _long_renewal(text: str) -> bool:
    """Auto-renewal only matters when a term > 12 months or a notice window > 60 days appears."""
    for m in _DURATION.finditer(text):
        n, unit = int(m.group(1)), m.group(2)
        if (unit.startswith("year") or unit.startswith("سن")) and n >= 2:
            return True
        if (unit.startswith("month") or "شهر" in unit) and n > 12:
            return True
        if (unit.startswith("day") or unit in ("يوم", "ايام")) and n > 60:
            return True
    return False


def scan(contract: Contract) -> list[Tripwire]:
    hits: list[Tripwire] = []
    for c in contract.clauses:
        t = normalize(c.text)
        for rule_id, critical, rx in PATTERNS:
            if rule_id in _NEEDS and not _NEEDS[rule_id].search(t):
                continue
            if rule_id == "AUTO-RENEW" and not _long_renewal(t):
                continue
            m = next((m for m in rx.finditer(t) if not _negated(t, m.start())), None)
            if m:
                hits.append(Tripwire(c.id, rule_id, critical, m.group(0)[:120]))
        for m in _MONTHS_CAP.finditer(t):  # liability cap measured in months, below 12
            if (n := _first_int(m)) is not None and n < 12:
                hits.append(Tripwire(c.id, "LIAB-CAP", True, m.group(0)[-120:]))
                break
        if _PAY_CONTEXT.search(t):
            for m in _PAY_DAYS.finditer(t):
                if (n := _first_int(m)) is not None and n < 30:
                    hits.append(Tripwire(c.id, "PAY-TERMS", False, m.group(0)[:120]))
                    break
            for m in _PREPAY.finditer(t):
                if (n := _first_int(m)) is not None and n > 50:
                    hits.append(Tripwire(c.id, "PAY-TERMS", False, m.group(0)[:120]))
                    break
    seen: set[tuple[str, str]] = set()
    out = []
    for h in hits:  # one tripwire per (clause, rule); a critical one wins
        key = (h.clause_id, h.rule_id)
        if key in seen:
            if h.critical:
                out = [x for x in out if (x.clause_id, x.rule_id) != key] + [h]
            continue
        seen.add(key)
        out.append(h)
    return out
