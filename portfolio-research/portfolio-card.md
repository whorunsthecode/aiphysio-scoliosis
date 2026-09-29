# Portfolio card — Balance

**Title.** Balance: a scoliosis home-exercise coach that refuses to guess

**Description (36 words).** A web app for adults doing prescribed scoliosis exercises at home. It screens for red flags every session, builds a curve-pattern-specific programme or delivers the physio's own, coaches form by webcam, and stays side-neutral when the side is uncertain.

**Status line.** Working prototype, May–September 2026; builds and passes ~160 property checks; preview-deployed; no production launch and no users beyond the author. [E26, E27, E43]

**Three demonstrated capabilities.**
1. **Designing around model limits.** Every model call is wrapped in deterministic policy: rate limits before, side-cue enforcement and red-flag gating after, and a keyword pre-filter that bypasses the model on safety phrases. [E11–E14]
2. **Scoping to the evidence.** Demoted webcam measurement after quantifying its setup dependence and a cleared competitor; repositioned as the adherence layer; replaced millimetres with camera-free measures gated on a detection limit. [E08, E09]
3. **Testable acceptance criteria and post-build correction.** Seven check suites; a model-persona clinical audit with refuters and judges; all 35 surviving findings fixed, including a reversed corrective cue and unsupported "absolute" bans. [E22–E24, E26]

**Suggested CTA.** "Read the decision record" → link to the case study; or "Watch one session" → A1 recording.

**100-word interview summary.**
Problem: scoliosis exercise happens at home, unwatched, and a wrong-side exercise makes the curve worse. Decision: after quantifying that the webcam scan measured camera setup rather than the person, and finding a cleared competitor owned monitoring, I dropped the measurement claim and built the coaching and safety layer instead. Trade-off: every model output is bounded by deterministic code, which makes the product blunter and quieter than a chat app. Result: a prototype that builds, passes ~160 checks, and fixed all 35 findings from an adversarial review, but has no users yet. Learning: an honest limit beats a confident number a clinician can disprove.
