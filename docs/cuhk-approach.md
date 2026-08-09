# CUHK approach — which trial to target, and protecting the IP first

Working notes. Two decisions to get right before any conversation happens.

---

## 1. The trial to target

CUHK's Department of Orthopaedics & Traumatology at Prince of Wales runs three
lines of AIS work that matter here:

| Trial | What it is | Relevance |
| --- | --- | --- |
| [NCT03427970](https://clinicaltrials.gov/study/NCT03427970) | Three-dimensionally integrated exercise for AIS | **Primary target.** Same domain as Balance. |
| [NCT03135665](https://clinicaltrials.gov/study/NCT03135665) | Radiation-free ultrasound screening for HK schoolchildren | Secondary. Aligns with the ATR feature. |
| [NCT03904914](https://clinicaltrials.gov/study/NCT03904914) | TOCI — skeletal maturity and curve progression prediction | Long-term. Not an opening. |

### Why the exercise trial, and not the others

**Every home-exercise trial has the same unsolved problem: they cannot measure
whether the exercise actually happened.** Adherence is captured by paper diary
or recall, both of which are known to overstate. That weakness sits directly
in the interpretation of the result — if the intervention arm underperforms,
you cannot tell whether the exercise doesn't work or whether nobody did it.

That is the gap Balance fills, and it is the only part of this product that is
genuinely ahead of what a research group could commission. Continuous,
objective adherence: which exercises, when, for how long, with what form
quality, against what pain that day.

This reframes the conversation completely. You are not asking a hospital to
adopt an unvalidated app. You are offering an instrument that strengthens the
interpretation of a trial they are already running, at near-zero cost and
near-zero risk to them.

**The ultrasound screening trial is the wrong first target** even though the
ATR feature looks adjacent. They already have Scolioscan. Walking in with a
phone-based measurement next to a validated ultrasound system invites a direct
comparison you will lose. The right framing for ATR, later, is *between-visit
monitoring* — the measurement they cannot take when the patient is at home —
not a substitute for the one they take in clinic.

**TOCI and progression prediction is the three-year conversation.** Longitudinal
behaviour plus pain plus adherence is plausibly a progression-risk signal
nobody currently has. It is also worth nothing until there are patient-years
of it. Mention it as a direction, never as an offer.

### The shape of the ask

Not "would you use my app." The ask is:

> Your trial measures exercise adherence by self-report. I have a system that
> measures it objectively — what was done, when, for how long, and how well.
> Would an adherence sub-study be useful to you?

What you provide: adherence logs, form-quality scores, daily pain, ATR trend,
and a per-patient report their physiotherapist can read in under a minute.

What you ask for initially: **nothing**. Not funding, not data, not a
commercial arrangement. The value of a yes is the relationship, the ethics
pathway, and a clinician who has actually looked at your contraindication
rules.

What you ask for eventually: co-authorship on the sub-study, and the right to
cite aggregate anonymised findings. Not ownership of anything.

### Practical constraints

- **Check trial status first.** These registrations may be completed or closed
  to recruitment. A completed trial cannot take a new instrument — but the
  group's *next* trial can, and that is a better conversation anyway because
  you can be designed in rather than bolted on.
- **Adding an instrument mid-trial needs an ethics amendment.** Slow. An
  observational sub-study alongside, or a design-in to the next protocol, both
  avoid this.
- **Lead with the safety architecture, not the features.** The red-flag screen
  and the contraindication engine are what make a clinician willing to let this
  near their patients. The pose scan is not the thing to open with.

### The one-sentence version

*A trial that can finally tell whether the exercise was actually done.*

---

## 2. The IP checklist

Do this **before** any meeting, not after. Once a second institution has been
in the room, clarifying who owned what gets materially harder.

### Establish clean provenance

- [ ] Tag the current state of the repo (`git tag -a pre-cuhk-baseline`) so
      there is an unambiguous marker of what existed before any collaboration.
- [ ] Record the commit hash and date somewhere outside the repo.
- [ ] Write a one-page **Prior IP statement**: what Balance is, what it does,
      when it was built, by whom, listing the major components. Attach the
      commit hash. This is the document you hand over if anyone ever asks what
      you brought versus what was created jointly.

The git history is the asset here — timestamped, granular, and independently
verifiable. Most solo founders cannot prove provenance this cleanly.

### Resolve the HSBC question

This is the one that compounds. Unresolved, it does not stay a private
uncertainty — it becomes a defect in the chain of title that a university
lawyer, and later an investor, will find.

- [ ] Read the IP assignment clause in your employment contract. HK banking
      contracts are typically broad.
- [ ] Establish whether any of it was built on company time or equipment.
- [ ] If there is any ambiguity, seek a written waiver or confirmation of
      non-interest **now**, while it is a routine request and not a deal issue.

### Understand CUHK's position before signing anything

Ask the Knowledge Transfer Office these three questions explicitly, in writing:

1. What claim, if any, does CUHK assert over **pre-existing IP** brought into a
   collaboration by a non-staff, non-student party?
2. What is the ownership position on **improvements made during** the
   collaboration — including code written to meet study requirements?
3. Who owns the **data generated** by the study, and what use rights does the
   contributing party retain?

Expected answers: nil on (1) if properly documented, negotiable on (2), and
CUHK/the study on (3) — which is fine and normal, and worth conceding early
and explicitly so it does not look like something you tried to keep.

### Before signing

- [ ] No NDA containing an IP assignment clause. Read it; they are common and
      often boilerplate.
- [ ] No collaboration agreement without an IP clause you actually understand.
- [ ] Independent advice before signature. Do not rely on the counterparty's
      description of their own agreement.

### The TSSSU consequence

Verified figures: TSSSU-O offers up to **HK$600,000/year** for up to three
years; TSSSU+ up to **HK$1,000,000/year** matching, with a scheme-level cap
around HK$1.5m/year. Eligibility requires a HK-registered company under two
years old for TSSSU-O (seven for TSSSU+), with at least two members.

**The catch:** for TSSSU-O, *active CUHK members must be the effective majority
of shareholders*. If you are an alum rather than current staff or a student,
you likely do not qualify alone — you would need a CUHK co-founder holding
majority.

That is a control decision, not a paperwork detail. Three options:

1. **Take TSSSU-O with a CUHK co-founder holding majority.** Non-dilutive money
   and a clinical co-founder in one move — which solves the single biggest gap
   in this venture. Cost: you are no longer the majority owner.
2. **Check whether TSSSU+ has different shareholder requirements.** The
   seven-year window suggests a different structure; verify rather than assume.
3. **Skip TSSSU. Collaborate without the funding.** Slower and poorer, but you
   keep control and the relationship still delivers ethics access, clinical
   review and credibility.

Confirm with the KTO what "active member" means — whether alumni status counts
is the hinge, and it is a five-minute question that changes the whole plan.

---

## Sequence

1. Resolve HSBC. Tag the repo. Write the prior-IP statement.
2. Ask the KTO the three ownership questions and the "active member" question.
3. Check the status of NCT03427970 and whether a successor study is planned.
4. Approach a researcher — not the department chair — with the adherence
   sub-study framing.
5. Lead with the safety architecture. Ask them to review the contraindication
   ruleset.
6. Discuss funding structure only once ownership is settled in writing.
