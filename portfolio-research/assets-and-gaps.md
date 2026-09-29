# Balance — Assets and gaps

Prepared 2026-09-29. Source IDs resolve to `evidence-pack.md`.

## 1. Minimum visuals

| # | Asset | Claim it supports | Exists? | To capture | Proposed caption | Anonymisation |
|---|---|---|---|---|---|---|
| A1 | 45–60 s screen recording of one session: red-flag screen → pain check → scan → programme preview → one coached exercise with a voice cue | The core experience and the every-session safety gate (E13, E21) | No | From the Vercel preview of commit `1e0740f` on a laptop; use a demo profile, not Karmen's real profile | "One session: the app asks the seven safety questions first, then builds today's programme from the curve pattern and today's pain." | Use a fictitious name and curve; do not show the real X-ray |
| A2 | Screenshot: programme preview when convexity is disputed (self-report vs X-ray), showing the side-neutral note | Safe degradation instead of guessing (E19, E20) | No | Onboarding: answer "left" on the curve step, upload any PA film with a marker read as "right", apply, then start a session | "When two sources disagree about which side the curve bulges toward, the programme goes side-neutral and says why." | Use a public-domain teaching radiograph; never Karmen's |
| A3 | Before/after table: the sitting waist fold cue text at `b42ca41` vs `1e0740f` (`git diff b42ca41 1e0740f -- lib/exercises/library.ts`) | The audit found a reversed corrective cue and it was fixed (E22, E23) | Yes, in git | Render the two cue strings side by side | "The audit found a corrective cue that folded into the curve. Before and after." | None |
| A4 | Two-column figure: the Coach model's raw JSON `side_cue` vs the enforced library cue | "Model proposes, code decides" (E11) | Partly (code) | Run `/api/agents/coach` manually with a seeded profile and log both values; or a static mock labelled as such | "The weekly-planning model picks exercises; the side cue it wrote is replaced from the library for the user's pattern." | Seeded data only; label as demo |
| A5 | Small chart: identical 4° tilt reported as 33.2 / 27.9 / 24.1 mm for 420 / 500 / 580 mm torsos; and the yaw sweep 6.00→6.14° | Why measurement was demoted (E09) | Numbers exist (check script + strategy doc); no chart | Generate from `npm run check:pose` output | "The same posture, three body sizes, three different 'measurements'. The scan measured setup, not the person." | None |
| A6 | Gate diagram (one Mermaid, already in evidence-pack §2) | Where deterministic code sits around each model call | Yes (Mermaid) | Export to SVG | "Every model call is wrapped: rate limits before, side-cue enforcement and red-flag gating after." | None |
| A7 | Screenshot of `/care-team` | Optional; the agent tier | Page exists | Only if seeded data is clearly labelled | "Agent activity on synthetic seed data." | Must state "synthetic" (E30) |

Do **not** use: the real X-ray, the real profile name, Telegram screenshots containing the chat id, the strategy doc's HSBC line, preview URLs.

No evaluation or outcome chart is recommended: there is no user data to chart (E28, E43), and the audit counts (40→35) are counts of model-persona findings, better stated as text than plotted as if they were an evaluation result.

## 2. Five most important questions for Karmen, ranked by impact

1. **Have you used Balance on yourself, how many sessions, and on which build?** This is the only possible source of a task-completion or usability claim. Without it the case study must say "no usage".
2. **Was the May 2026 build (110 files, ~26k lines in one commit) hand-written, AI-assisted, or generated from a spec you wrote?** The case study currently says "[CONFIRM]"; the Manus role values precise ownership, and the git trailers only cover August onward.
3. **Are you willing to state publicly that you have scoliosis?** It is the strongest problem-validation fact in the record and the strategy doc calls it the founder asset, but it is health information and the draft only includes it if you say yes.
4. **Has any clinician, physio, or CUHK contact seen the product or the contraindication rules?** The CUHK notes are a plan; if an approach happened, that changes the collaboration section.
5. **What did you do before this app — paper programme, a notes file, nothing?** The "previous workaround" section is empty; one honest sentence from you fills it.

## 3. Missing evidence worth collecting (cheap, in order)

- **Founder session log.** Ten sessions on the preview build over two weeks: date, completed y/n, exercises done, any cue that was wrong. Gives a first task-completion figure and a usability list.
- **Test–retest study** (already designed in `docs/product-strategy.html` §"The N-of-1 protocol"): ten paired scans and ten paired trunk-rotation readings with full re-setup. Produces the detection limit the trend engine is waiting for. Costs one week.
- **One clinician read-through** of `lib/exercises/library.ts` and `lib/exercises/contraindications.ts`: count agree / change / remove per exercise. Converts the model-persona audit into something a reader can trust.
- **Enable Vercel Web Analytics and a production deploy** on the branch, even for one user: activation and return visits become observable.
- **Chat pre-filter corpus.** Fifty realistic messages (25 should flag, 25 should not) written by Karmen and one other person; record precision and recall. The current lists are 10 and 5 phrasings.

## 4. A small, realistic evaluation plan

Goal: replace "no evidence" with three defensible numbers in four weeks, solo, at no cost.

| Week | Activity | Output | What result would change |
|---|---|---|---|
| 1 | Deploy the branch to production; enable analytics; run 5 sessions yourself | Sessions started / completed; first failure list | Any repeated abort point becomes the first UX fix |
| 1–2 | Test–retest: 10 scan pairs + 10 ATR pairs, matched time of day | Between-session SEM and MDC95 | MDC larger than plausible monthly change → remove trend labels |
| 2–3 | Pre-filter corpus (50 messages, two authors) | Precision / recall of the safety pre-filter | Recall < 0.95 on the must-flag set → widen patterns; precision < 0.6 → soften the fixed reply |
| 3–4 | Recruit 3 adults with scoliosis from a community (not adolescents); one supervised session each, think-aloud | Completion, confusion points, whether the "which side is higher" question is answerable | Two of three cannot answer the side question → X-ray/clinician side becomes mandatory for asymmetric work |
| 4 | One physio read-through of 16 exercises + 9 rules | Agree / change / remove counts | Any "remove" on a Tier 1–3 item → pull it before more users |

Acceptance criteria are written so a number can fail them; the point is to be able to say "we tested X and it did / did not hold".

## 4b. Small inaccuracies noticed in the repo (not changed, per the no-product-edits rule)

- `components/session/SessionSafetyCheck.tsx` header comment says "Seven yes/no taps"; `questionsFor("ongoing")` returns nine questions. The draft says nine.
- `README.md:22` says Gemini 2.0 Flash; `lib/gemini.ts:4` defaults to `gemini-2.0-flash-lite`.
- `README.md:62` still lists onboarding as 7 steps; it is 8 (safety step added 2026-08-08).

## 5. Claims to avoid (they exceed the evidence)

- "Users", "patients", "retention", "adherence improved" — there are none / no data (E28, E43).
- "Clinically validated", "reviewed by clinicians", "physio-approved" — the audit was model-generated (E22).
- "Launched", "live" — only preview deployments succeeded (E27).
- "Measures your curve" or any Cobb / progression language — the product itself now forbids it (README Honest limits).
- "Proven by an RCT" — the trial (E10) tested a different system with wearables and a clinician portal; the strategy doc was softened for exactly this reason.
- "Built from scratch by me" for the August–September work, or "20,000 lines" as a proxy for value.
- "AI agent" as a product descriptor — the scheduled jobs are single model calls wrapped in deterministic policy; the only tool-using loop is the chat handler, and it is bounded to one tool round.
- The 9.4 % HK screening PPV and the ρ = 0.97 ATR figure unless re-sourced (E34 footer flags them).
