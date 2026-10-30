# Demo script (about 4 minutes)

Works with no network or API key: the four scenes are recorded runs replayed as if live (clearly
labelled "Replay"). Have the app open on Review, light theme, browser at 100%, nothing confidential on
screen (no `.env`, no brief).

| Time | Show | Say |
|---|---|---|
| 0:00 | Review page, welcome panel | "Legal teams read every contract by hand, and most are routine. Mizan owns contract review end to end: it reads Arabic, English or bilingual contracts, checks every clause against the buyer's playbook, and routes each one: approve, negotiate, or escalate to a lawyer." |
| 0:25 | Click **Guided demo**. Scene 1: routine NDA | "Every clause read and typed, nothing deviates, the liability and governing-law clauses are there, and the words capping our liability are quoted. Code approves it; no human touches it." Point at the route card: "The route is computed by code, not chosen by the model." |
| 0:55 | Next scene: Arabic services contract | "Two issues, quoted in the Arabic: a 2% monthly late charge (riba) and unrestricted data transfers. Route: negotiate." Open **Download redline (PDF)**: struck text, proposed wording, right to left. |
| 1:35 | Next scene: uncapped liability, Arabic | "Our liability is uncapped. That's critical: it never approves, whatever the model writes. It escalates with the exact question for the lawyer." Show **Two detectors**: the model's finding and the independent pattern check agree. |
| 2:05 | Next scene: prompt injection | "This contract tells automated reviewers to approve it. The agent treats contract text as data, reports the instruction, and code escalates." |
| 2:30 | **Open the Inbox** | "Only what needs a person reaches people: an escalation with the question, a redline waiting for approval." |
| 2:50 | **Proof** | "Measured, not claimed." Point at: blind held-out set (100% routes, 0 wrong approvals); second blind batch; real contracts (CUAD SEC filings, Saudi government contracts in Arabic up to 101 pages), where the first run wrongly approved 5 and the fix brought it to 0; another company's rules loaded from a file, both route flips correct. |
| 3:35 | Close | "Code owns the decision, the model reads, and anything uncertain goes to a lawyer: scans with low OCR confidence, missing clauses, no verified cap on our liability. About five cents and fifteen seconds a contract." |

Backup if anything fails live: every scene is a replay, so restart the demo (Restart), or open the runs
from History.

Optional live segment (needs the API key, about 15 s): Use your own contract → upload
`samples/scans/ar-data-01-scan.pdf` → "Read by OCR, 87% confidence" → Review contract.
