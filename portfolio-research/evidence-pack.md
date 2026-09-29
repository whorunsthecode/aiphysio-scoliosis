# Balance — Evidence Pack

Prepared 2026-09-29 from the repository `whorunsthecode/aiphysio-scoliosis`, branch `claude/medtech-incubator-pitch-ojrr3y` at commit `1e0740f`, the Vercel project record, and the Claude Code session record for this branch. Nothing here was taken from user data, analytics, or people outside the workspace, because none of those sources exist or are reachable (see Evidence gaps).

Reading guide: every factual claim carries an ID (E01…) that resolves in the ledger at the end. "S-SUM" means the compaction summary of the Claude Code session, stored as the first entry of the session transcript dated 2026-09-06, which records Karmen's own messages from 2026-08-08 to 2026-09-06.

---

## 1. Product summary

**Balance** is a web app for people with scoliosis who have been told to do exercises at home between physiotherapy visits. It captures the person's curve pattern, screens for symptoms that mean exercise is the wrong next step, builds a short daily session of curve-pattern-specific exercises (or delivers the physio's own prescription when one is on file), coaches form through the webcam with voice cues, and records what was done. Three scheduled server jobs ("Coach", "Companion", "Liaison") summarise the week, decide whether to nudge, and draft a hand-off note for the next physio appointment. [E01, E02]

**Status.** Working prototype. The code builds and passes its check suites; the branch has successful Vercel *preview* deployments; no *production* deployment has ever succeeded (the last production build, from `main` on 2026-05-16, is in ERROR). Web analytics were never enabled. No evidence of any user other than the author exists in the workspace. [E27, E28, E29, E43]

**Intended users.** Adults with diagnosed scoliosis doing home exercise; the strategy document recommends adults first and adolescents only with a clinician relationship in place. [E34] The author has scoliosis herself and built it for her own use first. [E05 — health information, publish only with consent]

**Trigger.** Coming home from a physio appointment with a prescribed programme (or just a diagnosis) and needing to actually do it on the other six days, without knowing which side to work and without anyone watching form. [E01, E19, S-SUM]

**Previous workaround.** Not documented in the workspace. The strategy and CUHK notes describe the clinical status quo (paper diaries and recall for adherence; physio's notes on paper) but there is no recorded user research on what Karmen or anyone else did before this app. [Gap G1]

**Scale of the codebase.** 134 TypeScript/TSX files, about 26,000 lines including scripts and checks; 16 library exercises in five tiers; 9 contraindication rules; seven property-check suites totalling roughly 160 assertions. [E25, E24, E26]

---

## 2. Core user flow (traced through the implementation)

```mermaid
flowchart TD
  O[Onboarding: name+age → curve → segments → X-ray (optional, Gemini read) → physio programme (optional, Groq parse + user clarifications) → lifestyle → pain → red-flag screen] --> S0[Session: preparing]
  S0 --> S1[Red-flag screen, every session]
  S1 -- emergency answer --> STOP[Programme is empty. Notice + copyable hand-off summary. No 'begin anyway'.]
  S1 --> S2[Pain check]
  S2 --> S3[Posture scan, MoveNet, 10 s]
  S3 --> SEL{selectProgram — deterministic}
  SEL -- physio programme on file --> PC[physio_cleared: prescription authoritative; contraindication hits flagged, never blocked]
  SEL -- none --> SG[self_guided: library ∩ curve pattern ∩ pain ∩ triage; side-dependent exercises withheld if convexity unknown or disputed]
  SEL -- urgent flag --> RED[≤3 gentle symmetric items]
  SEL -- supervised population --> RED
  PC --> EX[Exercise coach: MediaPipe landmarks; compensation must persist 2 s; ≤1 voice cue / 5 s; TTS with browser fallback]
  SG --> EX
  RED --> EX
  EX --> S4[Re-scan → session saved locally, and to Supabase when configured]
```
Sources: onboarding steps `app/onboarding/page.tsx:50-125`; session phases `lib/session/types.ts:8-38`; gating `lib/exercises/selectProgram.ts:91-160`; coach cadence `lib/exercises/formCheck/types.ts:70-75`; persistence `lib/session/persist.ts:1-25`. [E13, E19, E21, E41]

**What the models do, and what code does** (the distinction the role cares about):

| Surface | Model call | Deterministic code around it | On failure |
|---|---|---|---|
| X-ray read (onboarding) | Gemini 2.0 Flash-Lite, JSON mode: curve type, apex, convex side, "other observations" | Convex side forced to "unclear" unless a laterality marker was seen; lateral films refused; no Cobb/rotation/segment fields exist in the schema; every field shown as "AI-read · unverified" and user-confirmed before save; side cross-checked against the user's own answer | Missing key → 503 and the step is skippable; non-JSON → error card with retry [E42] |
| Physio programme parse (onboarding) | Groq llama-3.3-70b, JSON mode: exercises, dose, ambiguities | Ambiguous items require the user's clarification; each parsed exercise is run through the contraindication rules and flagged | Missing key → 503, step skippable [E42] |
| Exercise selection | none | Pure function; red-flag gating inside it so no page can route around it [E13] | n/a |
| Coach (weekly) | Groq, JSON: exercise ids, sets/reps, message | Side cues the model wrote are discarded and replaced from the library for the user's curve pattern [E11]; name withheld from the model and substituted at delivery [E16] | Groq error → 502, no programme written |
| Companion (scheduled) | Groq, JSON: SEND / MARK / REPLAN_REQUEST / DEFER | Rate limit (2 nudges per 24 h) and quiet-hours are checked *before* the model is called [E12]; delivery policy decides channel [E15] | Groq error → 502, nothing sent |
| Free-text chat (Telegram) | Groq with 7 tools (log pain, log exercise, suggest exercise, set goal, request replan, mark observation, flag safety) | Keyword pre-filter runs first; on a red-flag hit the model is never consulted and a fixed reply is sent [E14]; exercise suggestions limited to the library; no physio programme on file → micro-movements only | Handler error is logged to the inbox and the user is told slash commands still work |
| Voice cues | none (TTS) | Server edge-tts, fallback to browser SpeechSynthesis [E41] | Silent fallback |

Where the system asks the human: X-ray fields (confirm/edit), programme ambiguities (clarify), red-flag screen (answer every question; unanswered is not "no"), convexity conflict (settle with a clinician; programme stays side-neutral until then). [E19, E20, E21]

Latency, cost, privacy constraints: Vercel Hobby (cron once per day, 10 s functions in May; agent runs designed to fit) [E31]; free-tier Groq and Gemini with a region fallback to the Lite model (`lib/gemini.ts:1-4`); chat context trimmed from about 10K to 3K tokens per round [E32]; identifying fields stripped before any model call [E16, E17].

---

## 3. Role, collaborators, timeline, constraints

- **Author of record.** Karmen. 15 commits authored as Karmen between 2026-05-03 and 2026-05-16 (initial commit empty; the v2 commit on 2026-05-05 adds 110 files, 25,908 lines). [E03, E04]
- **AI-assisted phase.** 18 commits between 2026-08-08 and 2026-09-06 are authored "Claude" with `Co-Authored-By: Claude Opus 5` / `Claude Fable 5.1` trailers and a Claude Code session link. They were produced in a session Karmen directed; her instructions are recorded in S-SUM. Her role in that phase was product owner and decision-maker (what to build, what to cut, what to audit), not implementer. [E04, E06, E07, E40]
- **Whether the May code was AI-assisted** is not recorded. [CONFIRM with Karmen.] The single 25,908-line commit and README references to an external "spec" suggest a design document existed outside the repo. [E44]
- **Collaborators.** None evidenced. No clinician, designer or engineer appears in the repo, docs, or session record. The CUHK notes are a plan for an approach that has not happened. [E35]
- **Constraints stated in the record.** Solo builder; free infrastructure only; token budget during the audit ("my token limit wont last…") [S-SUM]; no external users; an unresolved employer-IP question that the docs say to settle before any partnership (private — see E36).

---

## 4. Decision stories

### D1. Stop claiming measurement; become the coaching and adherence layer (2026-08-08)

- **Trigger.** Karmen asked how to take the product "to the next level" and pitch it. The first thing done was to audit the posture-scan maths and the competitive field rather than write a deck; she then redirected: "im focusing on product itself here instead of building a deck." [S-SUM, E06]
- **Evidence found.** The scan's rotation gate could not see rotation (sweeping true yaw 0→30° moved the estimate from 6.00° to 6.14°) and its millimetre values scaled with an assumed 500 mm torso (an identical 4° tilt read 33.2 / 27.9 / 24.1 mm for 420 / 500 / 580 mm torsos). Momentum Health held FDA 510(k) clearance for smartphone scoliosis *monitoring* but does not prescribe exercise. [E09, E08]
- **Options considered.** Documented in the strategy doc: fix single-view measurement (depth, fiducials, native app) vs. accept measurement as an input and compete on coaching. [E34]
- **Chosen.** Reposition as the adherence layer; fix the measurement bugs that were fixable; add measurements that need no camera (phone-as-inclinometer trunk rotation, timed holds, patient-reported outcomes); gate trend labels on a measured minimal detectable change. [E09, commits 71a5812, 3af0e23, c483b48, cae5f13]
- **Downside accepted.** Gives up the "measure your curve" headline and concedes that space to a cleared competitor; the trend engine now says "stable" far more often (fallback multiplier raised from 1.5× to 4× until a real MDC is measured). [commit 3af0e23]
- **In the product.** `bodyRotationDeg()` returns null instead of a fabricated value; snapshots carry `metricsVersion` so old and new numbers never pool; `/atr`, `/checkin`, PSFS. [E09]
- **Tested.** `check:pose` (17 assertions incl. the pinhole simulation), `check:repeatability` (13), `check:atr` (22), `check:outcomes` (20). [E26]
- **Observed result.** None with users. The test–retest study that the plan called for has not been run. [Gap G4]
- **Karmen's reaction on record.** "lmao momentum health was doing what i wanted to do." then "yea do it" / "but also use what they synthesised" — i.e. she accepted the reframe and asked that the competitor's positioning inform it. [E07 — private wording; paraphrase publicly]

### D2. The model proposes; deterministic code decides (May 2026 → Sep 2026)

- **Trigger.** Side cues on asymmetric exercises are clinical content: the wrong side reinforces the curve. [`app/api/agents/coach/route.ts:88-91`]
- **Chosen, in Karmen's own commit.** `bb77245` (2026-05-10, authored Karmen): "programmatically enforce library side cues" — the Coach LLM picks exercises and reps, and the code overwrites its side cue from the library for the user's pattern. [E11]
- **Extended in the AI-assisted phase.** Emergency red flags return zero exercises inside the pure selection function so no page can bypass it (2026-08-08) [E13]; Companion's rate limit and quiet hours are checked before the model is called (present since v2) [E12]; a keyword pre-filter runs ahead of the chat model and, on a hit, answers with a fixed template and logs a safety flag without consulting the model (2026-09-06) [E14].
- **Rationale on record.** Commit `4e63c82`: "Enforcement lives in selectProgram rather than the session page, so the library view cannot route around it." Commit `1e0740f`: the prompt asks the model to stop on red flags; the code makes sure of it.
- **Downside accepted.** Over-inclusive pre-filter (a mention of "fell" or "fever" gets a fixed "see someone" reply); less conversational flexibility in exactly the moments a user might want it.
- **Tested.** `check:safety` includes a must-flag list (10 phrasings) and a must-pass list (5), a check that the fixed reply never names an exercise, and that a physio-prescribed programme is gated too. [E26]
- **Observed result.** No production traffic; behaviour is only established by the checks.
- **Unknown.** False-positive rate on real chat; whether users tolerate the fixed reply.

### D3. Privacy over channel convenience: Telegram becomes an opt-in mirror (2026-08-09/10)

- **Trigger.** Karmen: "ok now evaluate and implement strict privacy and data safety measures for our app", then "move telegram in-app", then "Wire then" (approving the redaction wiring). [S-SUM]
- **Evidence found.** Telegram was the primary surface; the physio hand-off PDF — an identifiable clinical document — was sent as a file attachment; the whole onboarding state, including a base64 X-ray and the red-flag answers, was written to localStorage. [commits e203d79, 56d277b]
- **Options.** Keep Telegram (retention habit) vs. remove it (privacy) vs. keep as a mirror governed by policy. [`lib/messaging/deliver.ts:1-21`]
- **Chosen.** In-app inbox is the record of truth; Telegram off unless opted in per profile with the user's own chat id; documents and safety escalations are never mirrored regardless of caller; a failed mirror is not a failed delivery. Agents never receive the name; they write `{name}` and it is substituted at delivery. [E15, E16]
- **Downside accepted.** Loses the "message arrives where you already are" habit unless the user opts in; adds a signed-URL document flow.
- **Tested.** `check:messaging` (16), including "a document is not mirrored even in the most permissive configuration"; `check:privacy` (17), including "every profile-scoped table appears in the deletion list". [E26]
- **Unknown.** Whether opt-in rates would hold retention; no users.

### D4. When the key fact is unknown or disputed, degrade safely instead of guessing (2026-08-08, 2026-09-06)

- **Trigger.** Onboarding demanded curve type, side, segments, X-ray and programme; most arrivals know only "someone told me I have scoliosis". Karmen's brief for week 5 of the plan: "go onboarding". [S-SUM, commit f2517d0]
- **Evidence found.** With the curve unknown the side-plank check went silent exactly when needed, so a side-dependent exercise could be handed over with no side guidance. [commit f2517d0]
- **Chosen.** Explicit "I don't know" paths; every side-dependent exercise withheld while convexity is unknown, with a note in the user's terms; later, convexity is reconciled across self-report, X-ray and trunk-rotation reading and any disagreement sets the side to unknown. [E19, E20]
- **Downside accepted.** A thinner, symmetric programme for exactly the users who most want personalisation.
- **Tested.** `check:safety` unknown-curve block (5 assertions) and convexity block (5). [E26]
- **Unknown.** How often real users hit the conflict; whether they understand the note.

### D5. Commission an adversarial review of the clinical logic, then fix all of it (2026-09-05/06)

- **Trigger.** Karmen: "as a O&T with physio certification, audit this project - what is not accurate, what feature could 100x our existing product, what to do to enhance accuracy, what open-source projects we are yet to leverage." [E40]
- **What actually ran.** A multi-agent LLM workflow: five auditor personas (spine surgeon, PSSE physio, biomechanist, clinical safety, SOSORT guidelines), each finding then sent to two refuter personas, then two judge personas ranked proposals. 40 findings raised, 35 confirmed, 5 refuted. These were model personas, not clinicians; a handful of load-bearing facts were then checked against web sources by the session. [E22]
- **Karmen's priority calls on record.** Stop before judging to save tokens; then "fix everything from the list. actually before fixing them. run the judge and proposal steps." [S-SUM]
- **Chosen.** All 35 confirmed findings addressed in one commit: a reversed exercise cue corrected; an unsourced exercise removed; every "absolute" contraindication downgraded to relative; a supervised population tier; age collected; the X-ray reader narrowed; "cascade predictions" reframed as a watch-list. [E23, E24]
- **Downside accepted.** The audit's authority is that of a well-prompted model, not a licensed clinician; the docs say so and the "still open" list names a certified-physio sign-off as outstanding. Some fixes (e.g. every-session screening) add friction.
- **Tested.** Check suite extended to ~160 assertions; build passes. [E26]
- **Unknown.** Whether a real clinician agrees with the 35 findings or the fixes.

### Also on record (not written up as full stories)

- **Cost/infra trade-offs, Karmen-authored.** Companion dropped from every-2h to daily to fit Vercel Hobby, with an off-by-default GitHub Actions escape hatch (`252f44c`, `600d5ac`); chat context trimmed ~10K→3K tokens per round (`8d8154a`). [E31, E32]
- **Launch issue → change.** Every deployment had failed since May because the project had no framework preset; fixed in `vercel.json` after Karmen reported "idk why its failing to deploy on vercel" (`25fa724`, `c9659d7`). [E33]
- **Cut list.** The strategy document explicitly freezes the multi-agent analytics layer ("most impressive and least retention-relevant"), de-emphasises the X-ray reader, and defers native apps. [E34]

---

## 5. Outcome and evaluation evidence

| Category | A. Instrumentation | B. Collected | C. Analysed | D. Supports a conclusion |
|---|---|---|---|---|
| User discovery / problem validation | none | none | none | no — one patient-founder's experience only [E05, G1] |
| Prototype / usability testing | none recorded | none | none | no |
| Acceptance criteria | 7 property-check suites, ~160 assertions [E26] | run on every `npm run check` | pass/fail | yes, for the properties named in the checks |
| AI evaluation / failure analysis | must-flag / must-pass lists for the pre-filter; laterality enforcement checks; LLM-persona clinical audit [E22, E26] | audit outputs in `docs/audit-data/` | 40→35 findings | only that the code matched/fixed what model personas flagged |
| Activation / repeat use / retention | none (no analytics; sessions table exists but unreadable here) [E28, E29] | unknown | no | no |
| Task completion, result quality | none | none | none | no |
| Conversion / revenue | n/a | n/a | n/a | n/a |
| Support feedback / post-launch | Vercel deployment failure record [E27, E33] | yes (deploy logs) | yes | launch never reached production |
| Domain-expert coordination | none | none | none | no [Gap G2] |

What each kind of test actually establishes:
- **Automated property checks** establish that the pure functions behave as specified on synthetic inputs (e.g. a symmetric body at 3° yaw is not called asymmetric; an emergency flag yields zero exercises on both paths). They say nothing about real users or real camera conditions.
- **The LLM-persona audit** establishes internal consistency against published guidelines *as a model recalls them*; six facts were separately web-checked (SOSORT thresholds, Yuan 2025 comparator details, Fishman 2014/Sarkisova 2019, Frosch am Teich, McGill ratio, open-source licences) [`docs/clinical-audit.md` §"Independently verified"]. It is not clinical validation.
- **Founder testing.** Not documented. [CONFIRM: has Karmen run sessions on herself; how many; on which build?]
- **External users.** None.

---

## 6. Constraints and collaboration

Free-tier everything (Vercel Hobby, Supabase free, Groq, Gemini); solo; the agent tier is single-tenant by design and refuses to run if two profiles exist, to avoid sending one user's data to another's chat [E37]; Liaison cron intentionally dormant because "there's no active physio in the loop" [E38]. No collaborators evidenced.

## 7. Known limitations (stated by the product itself)

README "Honest limits": posture scan normalised to an assumed 500 mm torso; X-ray reader reads only curve type/apex/side-with-marker; exercise is not the whole of scoliosis care (SOSORT bracing indication shown at severity entry); self-guided asymmetric work withheld for supervised populations; every-session red-flag screen. [README.md:202-235]

## 8. Evidence gaps

- **G1. No user research.** No interviews, surveys, or usage logs. The problem framing rests on the author's own condition plus literature cited in the strategy doc.
- **G2. No clinician review.** The audit was model-generated; no physio or surgeon has seen the rules.
- **G3. No production deployment and no analytics.** Nothing can be said about activation, repeat use, or completion.
- **G4. The measurement study was never run.** Trend gating still uses the fallback multiplier.
- **G5. Authorship of the May build is unrecorded** (hand-written vs AI-assisted).
- **G6. The May design "spec" is not in the repo.**
- **G7. Session record is a compaction summary**, not a verbatim transcript, for 2026-08-08 → 2026-09-06.

---

## Evidence ledger

Statuses: **V** = Verified from implementation or records · **D** = Documented claim, not independently verified · **I** = Inference requiring confirmation · **U** = Unknown. Public-use: **Yes** / **Anon** (paraphrase or anonymise) / **No** (keep private).

| ID | Claim | Source and locator | Status | Caveat | Public |
|---|---|---|---|---|---|
| E01 | Balance is a scoliosis movement-coach web app: assessment, pattern-specific exercises, form feedback, contraindication blocking, tracking | README.md:1-9 | V | README opening still reads as pre-audit marketing; body is accurate | Yes |
| E02 | Stack: Next.js 14, Supabase, Groq llama-3.3-70b (JSON mode), Gemini 2.0 Flash-Lite, MoveNet, MediaPipe, edge-tts | README.md:13-25; lib/groq.ts:2; lib/gemini.ts:1-4 | V | Gemini model is Flash-Lite in code, README says Flash | Yes |
| E03 | Timeline: initial commit 2026-05-03 (empty); v2 + agents 2026-05-05 (110 files, +25,908); last Karmen-authored 2026-05-16; AI-session commits 2026-08-08→2026-09-06 | `git log --stat` | V | — | Yes |
| E04 | 15 commits authored Karmen (no AI trailers); 18 commits authored "Claude" with Co-Authored-By Opus 5 / Fable 5.1 and session link | `git log --format=%an` + trailers | V | Trailers show tool used, not who decided what | Yes (state precisely) |
| E05 | Karmen has scoliosis; built for her own use | S-SUM ("yes" to has-scoliosis); product-strategy.html:588-589 | D | Health information about a real person | **No** without her consent |
| E06 | Karmen redirected from pitch deck to product: "im focusing on product itself here instead of building a deck" | S-SUM, 2026-08-08 | D | Summary wording | Anon (paraphrase) |
| E07 | Karmen's reaction to the competitor finding and acceptance of the reframe | S-SUM ("lmao momentum health…", "yea do it", "but also use what they synthesised") | D | Informal wording | Anon (paraphrase) |
| E08 | Momentum Spine has FDA 510(k) clearance for smartphone monitoring and does not prescribe exercise | product-strategy.html:428-436; docs/clinical-audit.md §verified facts | D | Web-verified by the session in Aug/Sep 2026; not re-verified today | Yes, cite the FDA record directly |
| E09 | Posture scan was setup-dominated: yaw sweep 0→30° moved estimate 6.00→6.14°; identical 4° tilt read 33.2/27.9/24.1 mm across torso lengths | product-strategy.html:369-412; commit 71a5812; scripts/check-pose-invariants.ts; `npm run check:pose` passes 2026-09-29 | V | Numbers are from a pinhole simulation, not a camera | Yes |
| E10 | Yuan 2025 RCT (JAMA Netw Open, n=128) found −4.23° mean difference for digitally-supported home PSSE vs conventional care | product-strategy.html:469-482 (softened 2026-09-06) | D | Comparator used app + IMU + clinician portal; adolescents only | Yes, cite the paper |
| E11 | Coach's LLM side cues are replaced by library cues for the user's pattern | app/api/agents/coach/route.ts:88-92,157-228; commit bb77245 (Karmen, 2026-05-10) | V | — | Yes |
| E12 | Companion checks the 2-per-24h cap and quiet hours before calling the model | app/api/agents/companion/route.ts:41,73-111 | V | — | Yes |
| E13 | Emergency red flag → zero exercises inside `selectProgram`, on both physio and self-guided paths | lib/exercises/selectProgram.ts:94-112; scripts/check-safety.ts "a physio-prescribed programme is gated too" | V | — | Yes |
| E14 | Deterministic keyword pre-filter runs before the chat model; fixed reply; flag logged | lib/safety/prefilter.ts; lib/agents/conversation.ts (top of handleConversation); commit 1e0740f | V | Over-inclusive by design | Yes |
| E15 | In-app inbox is record of truth; Telegram opt-in per profile; documents and safety never mirrored; policy in `deliver()` | lib/messaging/deliver.ts:1-41,84-136; commit e203d79; supabase/schema.sql:268-283 | V | — | Yes |
| E16 | Name never reaches a model; `{name}` substituted at delivery; context redacted at `serializeContext` | lib/messaging/deliver.ts:54-65; lib/agents/context.ts:290-291; commit f2f50c2 | V | — | Yes |
| E17 | localStorage draft strips the X-ray image and screening answers | lib/privacy/data.ts:38-53; commit 56d277b | V | — | Yes |
| E18 | Data export and typed-confirmation erasure endpoints exist | app/api/privacy/export/route.ts; app/api/privacy/delete/route.ts; commit 56d277b | V | Not exercised end-to-end here | Yes |
| E19 | "I don't know" onboarding path; side-dependent exercises withheld when convexity unknown | commit f2517d0; lib/exercises/selectProgram.ts:224-235,375; scripts/check-safety.ts unknown-curve block | V | — | Yes |
| E20 | Convex side reconciled across self-report, X-ray and ATR; conflict → side-neutral + note | lib/exercises/convexity.ts; components/onboarding/steps/XrayStep.tsx (applyConfirmed); app/session/page.tsx | V | ATR votes only at ≥5° | Yes |
| E21 | Red-flag screen asked at the start of every session; emergency ends the session before any scan | components/session/SessionSafetyCheck.tsx; lib/session/types.ts:8-19 | V | — | Yes |
| E22 | Clinical audit: 5 LLM auditor personas, 2 refuters per finding, 2 judges; 40 raised, 35 confirmed, 5 refuted | docs/clinical-audit.md:1-3,738-782; docs/audit-data/*.json; commit b42ca41 | V (that it exists and how it was made) | **Not** a clinical review; personas are models | Yes, only if described as model-generated |
| E23 | All 35 confirmed findings addressed | docs/clinical-audit.md §"Fixes applied (2026-09-06)"; commit 1e0740f (36 files) | V | Copy-level items verified by reading; no clinician re-check | Yes |
| E24 | 9 contraindication rules; 0 absolute (8 relative, 2 ask_physio) | lib/exercises/contraindications.ts (grep of `category:`) | V | — | Yes |
| E25 | 16 library exercises across tiers 1–5 (5/4/2/4/1) | lib/exercises/library.ts | V | — | Yes |
| E26 | Seven check suites; assertions: pose 17, safety 58, repeatability 13, ATR 22, outcomes 20, privacy 17, messaging 16 (≈163); all pass; `next build` passes | scripts/check-*.ts run 2026-09-29; privacy count from commit 56d277b | V | Privacy count not re-counted (output format) | Yes |
| E27 | Vercel: production deploy from `main` (2026-05-16) state ERROR; branch preview deploys READY on 2026-08-10, 2026-09-05, 2026-09-06 | Vercel `list_deployments` for prj_aw9S…, queried 2026-09-29 | V | Preview URLs are not a public launch | Yes (status), No (URLs) |
| E28 | Web Analytics not enabled on the project | Vercel `count_pageviews` → 404 "Web Analytics not found", 2026-09-29 | V | — | Yes |
| E29 | No Supabase credentials in workspace; usage tables unreadable | `.env.local` absent | U | — | n/a |
| E30 | Demo data is synthetic (~30 seeded sessions, planted correlations) | scripts/seed-synthetic.ts:1-25; README.md:294-300 | V | Any care-team screenshot shows synthetic data unless stated | Yes, label it |
| E31 | Companion cron reduced to daily for Vercel Hobby; GitHub Actions 2-hourly path off by default | .github/workflows/companion-frequent.yml; vercel.json; commits 252f44c, 600d5ac (Karmen) | V | — | Yes |
| E32 | Chat context trimmed ~10K→3K tokens per round | commit 8d8154a (Karmen, 2026-05-16); lib/agents/conversation.ts:129-131 | D | Figure from commit title; not re-measured | Yes, as "about" |
| E33 | All deployments failed since May for lack of a framework preset; fixed 2026-08-10 | commits 25fa724, c9659d7; S-SUM "idk why its failing to deploy on vercel" | V | — | Yes |
| E34 | Strategy document: competitor matrix, cut/amplify lists, 8-week plan, N-of-1 protocol; footer flags 3 unverified claims | docs/product-strategy.html; commit 4c6c210 | D | Written by the AI session; adopted by Karmen (S-SUM "yup go ahead", "start building") | Anon (it names HSBC and the branch) |
| E35 | CUHK approach notes: target the exercise trial as an adherence instrument; IP checklist first | docs/cuhk-approach.md; S-SUM "latter two" | D | A plan; no approach made [CONFIRM] | Anon |
| E36 | Unresolved employer IP assignment question | docs/cuhk-approach.md:104-114; product-strategy.html:698 | D | Sensitive | **No** |
| E37 | Agent tier refuses to run with >1 profile (single-tenant by design) | README.md:182-190; commit 4215f5c | V | — | Yes |
| E38 | Liaison cron intentionally absent; runs on demand | README.md:339-349; vercel.json | V | — | Yes |
| E39 | Judged "100x" direction: physio-authored signed prescription in, verified-dose ledger out (scores 8 / 8.5) | docs/clinical-audit.md:738-782 | D | LLM judges; a proposal, not built | Yes, as a proposal |
| E40 | Karmen's audit brief and "fix everything… run the judge and proposal steps" | S-SUM, 2026-09-05/06 | D | Summary wording | Anon |
| E41 | TTS: server edge-tts, fallback to browser SpeechSynthesis | lib/tts.ts:1-4,53-111 | V | — | Yes |
| E42 | Model unavailability handled: missing key → 503 and step skippable; non-JSON → typed error; X-ray step shows error + retry | lib/groq.ts:111-149; lib/gemini.ts:30-75; components/onboarding/steps/XrayStep.tsx (error card) | V | — | Yes |
| E43 | No evidence of any user other than the author; whether the author used it herself is unrecorded | absence across repo, docs, Vercel | U | — | state as "unproven" |
| E44 | May design "spec" referenced but not in repo | lib/agents/prompts.ts:1-2; app/monthly/page.tsx:3-6 | U | — | n/a |
| E45 | Weeks 1–6 of the 8-week plan were built (Aug 8–9 commits); week 7 retention mechanics and week 8 "ten real users" were not | product-strategy.html:611-666 vs git log; grep for floor-session/grace-token finds nothing | V (absence) | — | Yes |
| E46 | Session-level decisions by Karmen: "start building", "finish screening UI then week 3", "go onboarding", "week 6" | S-SUM | D | Summary wording | Anon |
