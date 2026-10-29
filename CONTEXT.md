# HUMAIN Future AI Builders Hackathon — context

Platform: https://humain-ai.hackathon.com/#/event (challenges page is behind login; not published until the event)

## Known facts
- Dates/format: **30–31 Oct 2026, online** (from the acknowledgement doc, dated 27 Oct 2026; marked DRAFT / subject to final legal approval).
- Purpose: talent-assessment step of the **Misk x HUMAIN Traineeship Program** — judged as a hiring signal, not just a product. Submission ≠ guaranteed interview.
- Pick **ONE of three challenges**. Challenge text unknown until tomorrow.
- Organiser: LAMARKA; partners HUMAIN, Misk. Questions go to the platform's discussion forum.
- Each team member must separately accept the participant terms.

## Likely challenges (titles only, from the platform's selection form — no briefs yet; the form is "0/1", pick one)
1. **Agentic Recovery of a Failing System** — guess: an agent that detects, diagnoses and fixes/rolls back a broken service (logs, metrics, runbooks, tool calls). Prep: observability-style simulator, incident-triage agent loop, safe-action guardrails + audit log, eval on injected faults.
2. **Deliver AI with Less Compute** — guess: efficiency (quantization, distillation, caching, routing small→large models, batching) with measured quality/latency/cost tradeoffs. Prep: benchmark harness (latency, tokens, $/query, accuracy), llama.cpp/vLLM/ONNX familiarity, model-router pattern.
3. **Autonomous Enterprise** — guess: multi-agent workflows automating a business process (docs, approvals, data, ERP-like tools) with human-in-the-loop. Prep: agent orchestration skeleton, tool/MCP integration, Arabic+English handling, governance/audit.

Titles are all we know; the real briefs may differ. Don't over-invest in a guess tonight — build reusable pieces only (eval harness, agent loop with tracing, private repo template, demo-video routine).

## Rules that affect how we work (from the acknowledgement PDF)
- **Challenge briefs/parameters/datasets = HUMAIN Confidential Information.** Do NOT upload them to external AI tools, personal cloud storage, or use them to train/fine-tune a model without HUMAIN's prior written approval (§3.1). Organisers said any tool/AI is allowed — **get that confirmed in writing on the forum before pasting the brief into Claude**, and quote the reply.
- Allowed: tools/resources for independent work "as permitted by the Hackathon rules", subject to their licences, without exposing Confidential Info.
- **No GPL/AGPL (copyleft) code, models or datasets** in the submission. Prefer MIT/Apache/BSD. No scraped data/weights obtained against ToS (§6.1).
- Disclose any pre-existing or third-party components, licences and restrictions in the submission (§6).
- Don't make the work public (GitHub, portfolio, social, academic) without HUMAIN approval; 15 business days' written notice before publishing/open-sourcing (§2.2). Keep the repo **private**.
- Don't reuse challenge material in other competitions/startups/portfolio (§2.4).
- IP: HUMAIN gets a perpetual, irrevocable, sublicensable, commercial licence to the submission and ideas in it, plus "residuals" and a covenant not to sue (§5.5–5.6). Don't put anything proprietary/employer/university-owned in it.
- Submit only via the designated platform channel before the deadline; don't delete/alter submitted files (§4.3). Return/delete confidential material within 5 business days if asked.
- Security incident → email security@humain.com, cc legal@humain.com, within 24h.

## Tonight (before the brief drops)
- [ ] Register/sign in on the platform; check Challenges, Resources, Webinars, Forum, deadline and submission format (demo video? repo? slides?).
- [ ] Post on forum: "Can we paste the challenge brief into commercial AI assistants (Claude, etc.)? Which tools are approved?" Save the answer.
- [ ] Teammates (if any): each accepts terms separately.
- [ ] Prep a private repo template: Python or TS app skeleton, `.env.example`, README with licence table of third-party components, `docs/` for architecture + demo script.
- [ ] Set up API keys/credits for the model(s) you'll use (Anthropic, plus an Arabic-capable fallback — HUMAIN is Saudi; Arabic support is likely valued). Never commit keys.
- [ ] Rehearse screen-recording tool (OBS/Loom) — online hackathons are usually judged on a demo video.
- [ ] Sleep. Two-day online event.

## Plan for the day
1. 0:00–0:45 Read all three briefs. Score each: fit to your skills, demo-ability in ~24h, clarity of judging criteria. Pick one; don't switch.
2. Write a 1-page spec: problem, user, the single core flow, success metric, out of scope. Pin judging criteria at the top.
3. Build the thinnest end-to-end vertical slice first (input → model → output → UI), then deepen. Commit often.
4. Reserve the last ~4h for: polish, eval/numbers, README, architecture diagram, demo video, submission. Submit early, then iterate if allowed.
5. Pitch structure: problem → why it matters for Saudi/HUMAIN context → live demo → how it works → results/limits → next steps.

## Open questions for tomorrow
- Team or solo? Size limit?
- Judging criteria and weights; deadline (time zone); submission format.
- Datasets/sandbox/APIs HUMAIN provides (use those, not external copies).
- Whether HUMAIN's own models/APIs (e.g. ALLaM/HUMAIN Chat) are provided or expected.
