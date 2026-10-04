# Balance — Scoliosis Movement Coach

A web app that acts as a scoliosis-specific movement coach. It assesses
posture via webcam, prescribes asymmetric exercises tailored to the user's
specific curve pattern, gives real-time form feedback with voice guidance,
blocks contraindicated exercises, and tracks postural markers over time.

Built fully on free infrastructure: Vercel, Supabase, Groq, Gemini, MediaPipe,
TensorFlow.js, edge-tts.

---

## Stack

| Layer            | Choice                                                        |
| ---------------- | ------------------------------------------------------------- |
| Framework        | Next.js 14 (App Router) + TypeScript                          |
| Styling          | Tailwind CSS, Fraunces / Inter / JetBrains Mono               |
| Posture scan     | MoveNet Thunder via TensorFlow.js (accuracy-critical)         |
| Exercise form    | MediaPipe Pose Landmarker (latency-critical)                  |
| LLM (programs)   | Groq · `llama-3.3-70b-versatile` · JSON mode                  |
| Vision (X-ray)   | Google Gemini 2.0 Flash-Lite · JSON mode                      |
| TTS              | `edge-tts` via Vercel Python runtime; browser SpeechSynthesis fallback |
| Database         | Supabase Postgres (optional; localStorage fallback)           |
| Hosting          | Vercel hobby tier                                             |

---

## Local development

```bash
git clone <this repo>
cd scoliosis-coach
npm install
cp .env.example .env.local   # fill in keys (all optional for first run)
npm run dev
```

Visit `http://localhost:3000`. Without any keys, every feature still works:
- Onboarding saves the profile to `localStorage`
- Sessions save to `localStorage`
- X-ray + physio-program endpoints return a 503 with a clear error envelope; onboarding lets you skip
- TTS falls back to the browser's `SpeechSynthesis` API (no Python at dev time)

### What needs which key

| Feature                                | Requires                          |
| -------------------------------------- | --------------------------------- |
| Posture scan, form check, library, all UI | nothing                        |
| X-ray reading on onboarding step 4     | `GEMINI_API_KEY`                  |
| Physio program parsing on step 5       | `GROQ_API_KEY`                    |
| Cross-device profile + session sync    | `NEXT_PUBLIC_SUPABASE_URL` + anon + service-role |
| High-quality voice (vs browser TTS)    | nothing locally; Vercel runs the Python function in production |

---

## Routes

| Path                    | What                                                |
| ----------------------- | --------------------------------------------------- |
| `/`                     | Home — entry to all flows                           |
| `/onboarding`           | 8-step setup (welcome → curve → segments → X-ray → physio program → lifestyle → pain → safety check) |
| `/scan`                 | Standalone posture scan (MoveNet, multi-frame, tilt-aware on mobile) |
| `/library`              | Full exercise library + today's selected program demo + contraindication ruleset |
| `/exercise/[id]`        | Live coach (camera + MediaPipe + voice cues) for any of the 5 wired exercises |
| `/session`              | Daily session orchestrator: pain → scan → 3–5 exercises → re-scan → comparison |
| `/progress`             | Trend graphs (weighted regression with error bands) + lifestyle observations + history |
| `/components-preview`   | Visual identity preview                             |
| `/api/xray`             | POST: Gemini 2.0 Flash-Lite X-ray read              |
| `/api/parse-program`    | POST: Groq physio-program parsing                   |
| `/api/tts`              | POST: edge-tts (Python serverless function)         |

---

## Architecture quick map

```
/app
  /api/xray            Next.js API route → Gemini
  /api/parse-program   Next.js API route → Groq
  /onboarding          8-step flow (state in /lib/onboarding)
  /scan, /library      Single-page experiences
  /session             Session state machine (state in /lib/session)
  /exercise/[id]       Per-exercise coach
  /progress            Trend view

/api/tts.py            Vercel Python serverless function (edge-tts)

/components
  /ui                  Primitives (Button, Card, Chip, etc.)
  /onboarding          Per-step components
  /pose                Scan overlay, scanner, measurement rows
  /exercise            ExerciseCoach, CoachOverlay
  /session             SessionShell, PainQuickCheck, SessionComplete
  /charts              LineChart, MeasurementTrendCard, PainHeatmap

/lib
  /onboarding          Profile state, types, persist
  /pose                MoveNet + MediaPipe + compute + thresholds + tilt + stats
  /exercises           Library data, contraindications, selectProgram, formCheck/*
  /prompts             Gemini X-ray + Groq parse-program prompts
  /session             Session types + persist + comparison + trend + lifestyle
  /tts.ts              Client TTS with server + SpeechSynthesis fallback
  /db.ts, /groq.ts, /gemini.ts
```

---

## Deploy to Vercel

1. **Push the repo** to GitHub.

2. **Create the Vercel project**:
   ```bash
   npx vercel link
   ```
   Or import it in the Vercel dashboard.

3. **Add environment variables** in Vercel → Project → Settings → Environment Variables.
   Add the same keys as `.env.example` for `Production` (and `Preview` if you
   want feature branches to work end-to-end).

4. **Python runtime** is auto-detected from `/api/tts.py` + `requirements.txt`.
   No `vercel.json` needed.

5. **Deploy**:
   ```bash
   npx vercel --prod
   ```

After deploy:
- Hit `/api/tts` to verify the Python function (POST `{"text":"hello"}`, expect `audio/mpeg`)
- Hit `/api/xray` and `/api/parse-program` (POST a tiny payload) — both should reach Gemini/Groq

---

## Set up Supabase

1. Create a free project at https://supabase.com.
2. **SQL editor** → paste [`supabase/schema.sql`](./supabase/schema.sql), run.
3. **Storage** → create two buckets:
   - `xrays` (private, 10 MB max)
   - `monthly_assessments` (private, 5 MB max)
4. Copy from **Settings → API**:
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (server-only — never expose)
5. Restart `npm run dev` (or redeploy on Vercel).

The app will start writing to Supabase from then on. Existing localStorage
data is not migrated automatically — it's a stand-in for offline runs.

---

## Accounts and row-level security

Every table has RLS enabled and is reachable only by the account that owns it.
`profiles.user_id` points at `auth.users`; every other table reaches its owner
through `profile_id`. The `service_role` key bypasses RLS, which is what keeps
the cron and agent routes working without a user session.

Sign-in is a magic link — no passwords stored, reset, or leaked.

1. **Supabase dashboard → Authentication → Providers** — make sure Email is
   enabled. Turn off "Confirm email" only if you want faster local testing.
2. **Authentication → URL Configuration** — add your callback to the redirect
   allow-list:
   - `http://localhost:3000/auth/callback` for dev
   - `https://<your-domain>/auth/callback` for production
3. **Re-run [`supabase/schema.sql`](./supabase/schema.sql)** to add `user_id`
   and the RLS policies. Idempotent, so running it again is safe.
4. Visit `/sign-in` and request a link.

**Existing single-user data is preserved.** A profile created before accounts
existed has `user_id` null, which makes it invisible under RLS. The first
account to sign in adopts the oldest unclaimed profile, so prior sessions,
scans and pain logs carry over. Later accounts get their own profile.

Without Supabase env vars the app skips auth entirely and runs in its
localStorage-only mode, exactly as before.

### The agent tier is still single-tenant

`TELEGRAM_CHAT_ID` is one chat in the environment, so Coach, Companion and
Liaison have exactly one person they can reach. `getCurrentProfileId()` now
**refuses to run when more than one profile exists** rather than picking the
most recently updated one — which, with accounts, would have loaded one user's
pain history and sent it to a different user's Telegram. A second account
makes the agent tier inert until it is scoped per user. That needs per-user
Telegram linkage and cron jobs that iterate profiles.

---

## Get the API keys

- **Groq** — https://console.groq.com — generous free tier, JSON-mode supported
- **Gemini** — https://aistudio.google.com/apikey — the app calls
  `gemini-2.0-flash-lite` (set in `lib/gemini.ts`), which has free-tier
  access in regions where `gemini-2.0-flash` does not. Check Google's current
  quotas and terms; on the free tier Google may use what is sent to improve
  its products.

---

## Honest limits

This is a **movement coach that works alongside a physio**, not a medical
device. Specifically:

- **Exercise is not the whole of scoliosis care.** Per the SOSORT guideline:
  under 25° Cobb, exercise-based care and monitoring are the usual first
  step; 25–40° in a skeletally immature patient is a bracing indication,
  with exercise alongside; over 40° needs a specialist's plan and exercise
  alone is not a treatment for the curve. The app states this at the point
  where severity is entered and never implies that its programme replaces
  bracing or surgical review.
- Self-guided asymmetric exercise is withheld for post-fusion, in-brace,
  pregnant, osteoporotic and connective-tissue-disorder users; they get
  gentle symmetric work until a clinician's prescription is entered.
- Posture measurements are estimated from webcam pose landmarks, normalized
  to an assumed 500 mm torso. They're useful for spotting trends but
  aren't a replacement for a physio's Cobb angle measurements.
- The X-ray reader reads curve type, apex and — only when a laterality
  marker is visible in the frame — convex side. It does not estimate Cobb
  angles, rotation or segmental shift from a photo. Every field is labelled
  unverified and must be confirmed against the clinician's report.
- Which side the curve bulges toward is cross-checked across self-report,
  X-ray and the forward-bend measurement; when sources disagree, the
  programme runs side-neutral until a clinician settles it.
- A short red-flag screen runs at the start of every session, and a
  deterministic keyword pre-filter stops the chat model from suggesting
  exercise when a message describes a red-flag symptom.
- Form-check fires on compensations that hold for ≥2 s, with one cue per 5 s,
  and only on what webcam pose detection can reliably see (subtle pelvic tilt,
  for example, is out of scope for v1).
- Trend graphs apply inverse-variance weighting and only label a trend
  "improving" or "drifting" when the change exceeds 1.5× the measurement
  noise floor — small wiggles inside the band are not change.

---

## Scripts

```bash
npm run dev        # next dev
npm run build      # next build (production)
npm run start      # next start (run the production build)
npm run typecheck  # tsc --noEmit
npm run lint       # next lint
```

---

---

## Multi-agent care team (Tier 1 + Tier 3)

A genuine multi-agent layer on top of v2 — three autonomous agents (Coach,
Companion, Liaison) running on schedule via Vercel Cron, each with distinct
roles, real toolsets, and inter-agent messaging through a Postgres queue.

### Architecture

```
v2 app (Supabase) ──> Tier 1 nightly cron ──> baselines / correlations / cascade
                                              │
                                              ▼
                               buildContext() ──> three agents
                              ┌────────┬───────┴────────┬─────────┐
                              ▼        ▼                ▼         ▼
                            Coach   Companion       Liaison    (Tier 1)
                          (Sun 8pm) (daily)      (24h before  (nightly
                                                  appointment) analysis)
                              │        │                │
                              └────────┴────────┬───────┘
                                                ▼
                                  Tools: Supabase + Telegram + PDF generator
                                                │
                                                ▼
                              agent_messages table (inter-agent bus)
```

### Setup (in order)

1. **Apply the agent-tier schema** — run [`supabase/schema.sql`](./supabase/schema.sql)
   again; the `if not exists` clauses make it idempotent.
2. **Create the `documents` Supabase storage bucket** (private, 5 MB max).
3. **Set up the Telegram bot**:
   - Message @BotFather → `/newbot` → save the token.
   - Message your bot once, then visit
     `https://api.telegram.org/bot<TOKEN>/getUpdates` and copy `message.chat.id`.
   - Add `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` to `.env.local` and Vercel env.
4. **Set `CRON_SECRET`** in Vercel env to a random string. Vercel injects it
   automatically as the Bearer token on cron-triggered requests; the
   `authorizeCron()` helper in [`lib/agents/server-supabase.ts`](./lib/agents/server-supabase.ts)
   rejects production calls without it. Local dev bypasses if unset.
5. **Seed synthetic data** so Tier 1 has signal and the agents have context:
   ```bash
   npx tsx scripts/seed-synthetic.ts
   ```
   Plants three patterns: lumbar pain spikes 2 days after skipped right-hip-flexor
   stretches, pelvic rotation drift starting week 3, shoulder differential creep
   after badminton. ~30 sessions tagged `source='synthetic_seed'`.
6. **Run Tier 1 manually first** to verify the pipeline:
   ```bash
   curl http://localhost:3000/api/cron/baselines
   curl http://localhost:3000/api/cron/correlations
   curl http://localhost:3000/api/cron/cascade
   ```
   Confirm `personal_baselines`, `pain_correlations`, `cascade_predictions`
   in Supabase fill in. The seed pattern should show as a strong correlation
   between `right_hip_flexor_stretch_skipped` and `lumbar_pain_intensity`
   at lag=2.
7. **Trigger an agent** by hand:
   ```bash
   curl -X POST http://localhost:3000/api/agents/coach
   curl -X POST http://localhost:3000/api/agents/companion
   ```
   Coach writes a `weekly_programs` row + sends a Telegram summary.
   Companion writes a notification or observation, or defers.
8. **Set the Telegram webhook** after deploy so commands like `/status`,
   `/program`, `/replan`, `/appointment YYYY-MM-DD HH:MM`, `/observations`,
   `/quiet 12` route to your function:
   ```bash
   curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" \
        -d "url=https://<your-domain>/api/telegram/webhook"
   ```
9. **Open `/care-team`** to see all three agents, the Tier 1 outputs, the
   inter-agent message bus, and live "Run X now" buttons. This is the
   portfolio screenshare surface.

### Cron schedules ([`vercel.json`](./vercel.json))

| Path                                          | Schedule (UTC)             | What                                        |
| --------------------------------------------- | -------------------------- | ------------------------------------------- |
| `/api/cron/baselines`                         | `0 3 * * *`                | Nightly 30-day rolling per-measurement stats |
| `/api/cron/correlations`                      | `0 4 * * *`                | Pearson + bootstrap CI for behavior↔pain pairs |
| `/api/cron/cascade`                           | `0 5 * * *`                | Stage activation per curve-pattern model    |
| `/api/agents/coach`                           | `0 12 * * 0`               | Sundays — plans the week ahead              |
| `/api/agents/companion`                       | `0 0 * * *`                | Daily at 8am HK time (UTC+8). The every-2h cadence is in `.github/workflows/companion-frequent.yml`, off by default |

**Liaison is currently dormant** — its cron is intentionally not in `vercel.json`
because there's no active physio in the loop. The agent code is fully built
and the route still works on demand (manual button on `/care-team`). To
re-enable scheduled checks, add this line back to the `crons` array:

```json
{ "path": "/api/agents/liaison/check-upcoming", "schedule": "0 */6 * * *" }
```

That cron checks every 6 hours for appointments 18–30h out and fires Liaison
for any without a generated doc.

Every agent and API route declares `maxDuration = 30` (seconds). Whether a
deployment honours that, and how often crons may run, depends on the Vercel
plan; check the current limits. On Hobby, crons run at most once a day, which
is why Companion is daily here and the every-2h cadence lives in a GitHub
Actions workflow. A run is one or two model calls (Companion, Coach, Liaison
make one; chat makes up to two) plus a few Supabase reads and writes.

### Agent roles + non-negotiables

- **Coach** plans the week. Stays inside the physio's program, never overrides
  contraindications, explains every change vs. the previous week. If fewer
  than 10 sessions exist, produces a continuation plan with that note.
- **Companion** observes, runs daily (every 2h if the workflow is on), decides between SEND / MARK /
  REPLAN_REQUEST / DEFER. Hard-capped at 2 nudges per 24h, never repeats
  within 48h, honors `/quiet N` from Telegram. Defers most of the time.
- **Liaison** prepares physio handoff PDFs 24h before each logged appointment.
  Pulls only observations not yet consumed, marks them as consumed on the
  output doc. Renders to clean A4 PDF via WeasyPrint, uploads to Supabase
  Storage, attaches to Telegram.

### What `/care-team` shows

- Top stat row: sessions on file, nudges in last 14d, observations awaiting
  handoff, upcoming appointments
- **Coach** panel: this week's program (visualized by day), reasoning per
  change, manual "Run Coach now" button, previous week's reasoning collapsed
- **Companion** panel: recent nudges (text + timestamp), observations marked
  for handoff (with consumed/unconsumed state)
- **Liaison** panel: upcoming appointments + past handoff documents with
  one-line summaries
- **Tier 1** panel: baseline sample count + score mean, top correlations
  with strength + evidence count, active cascade stages + predicted-next
- **Inter-agent bus**: last 20 messages on `agent_messages` with
  from→to→type and processed/pending state

---

## License

Personal use. For research and portfolio purposes.
