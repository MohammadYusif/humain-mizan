# Demo script (3 minutes, for the Loom recording)

**Before you record:**
- Run `uv run hack serve` and open http://localhost:8000 on Review, light theme, browser at 100%.
- Keep nothing confidential on screen (no `.env`, no brief).
- Have `samples/demo/board-supply-confidential.txt` ready to drag in.
- The four Guided demo scenes are recorded runs replayed as if live (labelled "Replay"): no network or API key needed. Uploading a file and seeing its label needs no model call either.

| Time | Click | Say |
|---|---|---|
| 0:00 | Review page | "Legal reads every contract by hand, and most are routine. Mizan reviews Arabic, English or bilingual contracts against the buyer's playbook and routes each one: approve, negotiate, or a lawyer. The model reads. Code decides." |
| 0:15 | **Guided demo**, scene 1: routine NDA | "Every clause read and typed, nothing deviates, and the words that cap our liability are quoted and checked. Code approves it." Point at the route card. |
| 0:35 | **Next**, scene 2: Arabic services contract | "Two issues, quoted in Arabic: a 2% monthly late charge and unrestricted data transfers. Route: negotiate." Click **Download redline (PDF)**: "Struck text and proposed wording, right to left. The message to the supplier waits for a person to approve it." |
| 1:00 | **Next**, scene 3: uncapped liability | "Our liability is uncapped. That is critical, so it can never be approved, whatever the model writes. It goes to a lawyer with one precise question." Point at the two detectors agreeing. |
| 1:20 | **Use your own contract**, drop `board-supply-confidential.txt`, **Add contract** | "Before any model sees a contract, Mizan reads it here and suggests who may see it. This one is marked Strictly confidential, so it is Restricted: no model call at all, it goes straight to a lawyer. Making a label stricter is one click; making it looser is recorded as a person's decision." |
| 1:45 | **Inbox** | "Only what needs a person reaches people: the escalation with its question, the redline waiting for approval." |
| 2:00 | **Proof**, scroll slowly | "Measured, not claimed. 59 contracts, 27 of them real. Every answer key was written first and committed before the run. The first run on real contracts approved 5 of 14; we found why and fixed it with one general rule. Then 12 new real SEC contracts, picked by a rule and run once, blind: none approved, 11 of 12 routes right. The main suite gives the same result in four runs." |
| 2:40 | Stay on Proof | "Where it is weak: on real contracts it finds about two thirds of the issues. It catches the dangerous ones, liability, interest, indemnity, and misses many termination and payment terms. So it never approves what it should not, and it says what it missed." |
| 2:50 | Close | "Mizan: the model reads, code decides, and anything uncertain goes to a lawyer. About five cents a typical contract." |

If anything goes wrong: every scene is a replay, so press **Restart**, or open the runs from History.
