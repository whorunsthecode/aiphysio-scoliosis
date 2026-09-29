# Balance — a scoliosis home-exercise coach that refuses to guess

*Review draft. Bracketed IDs resolve to `evidence-pack.md`. `[CONFIRM: …]` marks facts only Karmen can supply. About 1,000 words.*

---

## A. Product at a glance

**Balance** is a web app for adults with scoliosis who have to do prescribed exercises at home between physio visits. It captures the curve pattern, screens for symptoms that mean "don't exercise today", builds a short pattern-specific session (or delivers the physio's own prescription), coaches form through the webcam, and drafts a hand-off note for the next appointment. [E01]

**My role.** Founder and product owner, solo. I built the first version in May 2026 and, from August, directed an AI coding assistant through a measurement audit, a strategic reframe, safety and privacy work, and a clinical-logic audit. Every commit from August onward is co-authored with that assistant; the decisions were mine. [E03, E04] [CONFIRM: was the May build hand-written, AI-assisted, or generated from your spec?]

**Status.** Working prototype. Builds cleanly, passes about 160 automated property checks, and deploys as a Vercel preview. No production deployment has succeeded, there are no analytics, and nobody but me has used it. [E26, E27, E28, E43] [CONFIRM: how many sessions have you run on yourself, on which build?]

---

## B. The problem I chose

I have scoliosis. [E05 — publish only if you're comfortable] The part of care that happens at home is the part nobody watches: a physio hands you a programme, and for six days you're guessing which side to work, whether your form is right, and whether a new pain is something to push through or stop for.

What validated this was my own experience plus the literature: the one randomised trial of digitally supported home scoliosis exercise found a meaningful Cobb-angle benefit over standard care, and its mechanism was supervision and adherence, not measurement. [E10] I did not run user interviews. My own strategy document says everything I believed was untested against anyone but me, and that is still true. [E34, E43]

---

## C. The experience

**Trigger.** You're home with a diagnosis, or a programme, and it's exercise time.

**Input.** Onboarding asks about your curve in plain language ("which side is higher when you bend forward, not the hip that sticks out"), with "not sure" as a real answer. Paste your physio's notes and a model parses them, then the app asks you to clarify anything ambiguous. Upload an X-ray and a model reads curve type and apex, but names a side only if it can see a left/right marker on the film; every field is labelled unverified until you confirm it. [E19, E20, E42]

**Every session** opens with nine yes/no red-flag questions. An emergency answer ends the session with a notice and a copyable summary for a clinician; there is no "begin anyway". [E21, E13] Otherwise: pain check, a 10-second posture scan, then a programme chosen by deterministic code. A physio programme on file is authoritative and only ever flagged. Without one, the app picks from a 16-exercise library filtered by pattern, today's pain, and the screen. [E13, E25] During exercises the webcam tracks landmarks; a compensation must persist two seconds before a voice cue, and cues come at most once every five seconds.

**The failure path that matters.** If the app doesn't know which side the curve bulges toward, or two sources disagree (you said left, the X-ray read right), it withholds every side-dependent exercise, says why, and asks you to settle it with your physio. A coin flip is not acceptable when the downside is training a curve deeper. [E19, E20]

---

## D. The decisions that mattered

### 1. I stopped claiming to measure the curve

In August I had the posture-scan maths audited before anything else. The rotation gate couldn't see rotation: sweeping true yaw from 0° to 30° moved its estimate from 6.00° to 6.14°. The millimetre values scaled with an assumed 500 mm torso, so one 4° tilt read 33, 28 or 24 mm depending on body size. [E09] The same week I learned Momentum Health already held FDA clearance for smartphone scoliosis monitoring, and deliberately does not prescribe exercise. [E08]

I dropped the measurement headline and repositioned Balance as the coaching and adherence layer, with measurement as an input from better sources. [E06, E07, E34] The fixable bugs were fixed, the trend engine was re-gated to say "stable" unless a change beats a measured detection limit, and three camera-free measures were added: phone-as-inclinometer trunk rotation, timed holds, and patient-reported function. The cost is a quieter product that admits what it can't see. [E09, E45]

### 2. The model proposes; code decides

The first version of this rule is in my own May commit: the weekly-planning model picks exercises, but the side cue it writes is discarded and replaced from the library for the user's actual pattern, because a wrong side actively worsens a curve. [E11] The same shape now runs everywhere a model touches safety. The Companion's nudge cap and quiet hours are checked before the model is called. [E12] Emergency red flags return zero exercises inside the pure selection function, so no screen can route around it. [E13] Free-text chat passes through a keyword pre-filter that, on a red-flag phrase, answers with a fixed template and never consults the model. [E14] The trade-off is bluntness: "I fell over laughing" gets a "see someone" reply. I accepted that.

### 3. Privacy over the channel people already use

Telegram was the primary surface, and the physio hand-off PDF, an identifiable clinical document, went there as an attachment. I moved messaging in-app and made Telegram an opt-in mirror governed by one policy function: documents and safety escalations are never mirrored, whatever the caller asks. Models never receive the user's name; they write `{name}` and the app substitutes it at delivery. [E15, E16, E17] I gave up the "arrives where you already are" habit unless a user opts back in.

---

## E. How I tested and what changed

With no users, testing meant two things. First, property checks: seven suites, about 160 assertions. They project synthetic bodies through a camera model to assert that a symmetric person standing 3° off-square is not called asymmetric; they assert a physio-prescribed programme is still gated by an emergency flag; they hold must-flag and must-pass lists for the chat pre-filter. [E26]

Second, in September I commissioned an adversarial review of the clinical logic: five model-generated auditor personas (spine surgeon, scoliosis physio, biomechanist, clinical safety, guidelines), each finding sent to two refuter personas, then two judges. Forty findings were raised; thirty-five survived. [E22] I fixed all thirty-five: a reversed corrective cue, an unsourced exercise removed, every "absolute" contraindication downgraded to relative because the evidence didn't support bans, age collected so adolescent rules could fire, the X-ray reader narrowed, and "cascade predictions" renamed to what they are, a watch-list. [E23, E24] Those reviewers were models, not clinicians. The audit found what a careful reader would find; it does not replace a physio's sign-off, and the docs say so.

---

## F. Results and limits

Shipped: the flow above, the safety gates, the privacy controls, the camera-free measures, and the audit fixes, on a branch that builds and preview-deploys. [E27]

What users did: nothing measurable. No production launch, no analytics, no second user. [E28, E43] The test–retest study that would give the trend engine a real detection limit was planned in August and has not been run. [E45] No clinician has reviewed the rules. [evidence-pack G2]

---

## G. What I would do next (proposals, not done)

1. **Run the measurement study on myself.** Ten scans with full re-setup over a week, plus paired trunk-rotation readings, to compute a real between-session detection limit. If that limit exceeds the change exercise could plausibly produce in a month, the trend feature gets removed rather than hedged. [E45]
2. **Put the rules in front of one certified scoliosis physio before any external user.** If they reject more than a handful of the sixteen exercises or the side-cue conventions, self-guided mode gets withdrawn and the product narrows to delivering clinician-authored prescriptions, the direction the audit's judges already ranked first. [E39]
