"use client";

import { AlertCircle, Loader2, ShieldAlert, Sparkles } from "lucide-react";
import { Heading } from "@/components/ui/Heading";
import { Textarea } from "@/components/ui/Input";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { TagPill } from "@/components/ui/TagPill";
import { StepNav } from "@/components/onboarding/StepNav";
import { getExerciseById } from "@/lib/exercises/library";
import {
  findContraindications,
  type RuleHit,
} from "@/lib/exercises/contraindications";
import type { OnboardingState } from "@/lib/onboarding/types";
import type { ParsedProgram } from "@/lib/prompts/parseProgram";

interface ProgramStepProps {
  state: OnboardingState;
  update: (patch: Partial<OnboardingState>) => void;
  onBack: () => void;
  onNext: () => void;
  onSkip: () => void;
}

export function ProgramStep({
  state,
  update,
  onBack,
  onNext,
  onSkip,
}: ProgramStepProps) {
  const setProgram = (patch: Partial<OnboardingState["physioProgram"]>) =>
    update({ physioProgram: { ...state.physioProgram, ...patch } });

  const runParse = async () => {
    const text = state.physioProgram.rawText.trim();
    if (!text) return;
    setProgram({
      parseStatus: "loading",
      parseError: null,
    });

    try {
      const res = await fetch("/api/parse-program", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ raw_text: text }),
      });
      const json = (await res.json()) as
        | { ok: true; parsed: ParsedProgram }
        | { ok: false; error: string };
      if (!res.ok || !json.ok) {
        setProgram({
          parseStatus: "error",
          parseError:
            "error" in json ? json.error : `Parser returned ${res.status}`,
        });
        return;
      }
      setProgram({
        parsed: json.parsed,
        parseStatus: "ok",
        parseError: null,
      });
    } catch (e) {
      setProgram({
        parseStatus: "error",
        parseError: e instanceof Error ? e.message : "Network error",
      });
    }
  };

  const onTextChange = (value: string) => {
    setProgram({
      rawText: value,
      // invalidate previous parse if user edits the text after parsing
      parsed: null,
      parseStatus: "idle",
      parseError: null,
      clarifications: {},
    });
  };

  const setClarification = (idx: number, note: string) => {
    setProgram({
      clarifications: { ...state.physioProgram.clarifications, [idx]: note },
    });
  };

  const status = state.physioProgram.parseStatus;
  const canParse = state.physioProgram.rawText.trim().length > 0;

  return (
    <div className="space-y-10">
      <div className="space-y-3">
        <Heading level={1}>Did your physio give you a program?</Heading>
        <p className="text-ink-secondary max-w-xl">
          Optional. Paste it here in any format — bullets, shorthand, photos
          you&rsquo;ve transcribed. If you have one, I&rsquo;ll prioritise it
          over my library.
        </p>
      </div>

      <div className="space-y-3">
        <SectionLabel>Your physio&rsquo;s program</SectionLabel>
        <Textarea
          rows={10}
          placeholder={`e.g.\n— Hip bridge with left pelvis press-down, 10x3\n— Side plank right-side down, 30s build to 45s\n— No deadlifts, no roll-ups\n— Walk 30 min daily, stand every hour at work`}
          value={state.physioProgram.rawText}
          onChange={(e) => onTextChange(e.target.value)}
        />
        <div className="flex items-center justify-between gap-3 pt-1">
          <p className="text-[13px] text-ink-tertiary">
            I&rsquo;ll parse this into a structured program you can confirm.
          </p>
          <Button
            variant="secondary"
            onClick={runParse}
            disabled={!canParse || status === "loading"}
            leftIcon={
              status === "loading" ? (
                <Loader2 size={16} strokeWidth={1.5} className="animate-spin" />
              ) : (
                <Sparkles size={16} strokeWidth={1.5} />
              )
            }
          >
            {status === "loading"
              ? "Reading…"
              : status === "ok"
                ? "Parse again"
                : "Parse program"}
          </Button>
        </div>
      </div>

      {status === "error" && state.physioProgram.parseError ? (
        <Card tone="terracotta" className="flex items-start gap-4">
          <div className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/70 text-terracotta-dark">
            <AlertCircle size={18} strokeWidth={1.5} />
          </div>
          <div className="flex-1 space-y-1">
            <p className="font-display text-[17px] text-ink-primary">
              I couldn&rsquo;t parse this one.
            </p>
            <p className="text-[14px] text-ink-secondary">
              {state.physioProgram.parseError}
            </p>
          </div>
        </Card>
      ) : null}

      {status === "ok" && state.physioProgram.parsed ? (
        <ParsedProgramSummary
          parsed={state.physioProgram.parsed}
          clarifications={state.physioProgram.clarifications}
          onClarification={setClarification}
        />
      ) : null}

      <StepNav onBack={onBack} onNext={onNext} onSkip={onSkip} />
    </div>
  );
}

function ParsedProgramSummary({
  parsed,
  clarifications,
  onClarification,
}: {
  parsed: ParsedProgram;
  clarifications: Record<number, string>;
  onClarification: (idx: number, note: string) => void;
}) {
  const ambiguousCount = parsed.exercises.filter(
    (e) => e.ambiguities.length > 0,
  ).length;
  const clarifiedCount = parsed.exercises.filter(
    (_, i) => clarifications[i]?.trim().length,
  ).length;
  return (
    <div className="space-y-5">
      <div>
        <SectionLabel>Parsed exercises</SectionLabel>
        <p className="mt-1 text-[13px] text-ink-tertiary">
          {parsed.exercises.length === 0
            ? "I didn't find any clear exercises. That's OK — you can paste again or skip."
            : `${parsed.exercises.length} exercise${parsed.exercises.length === 1 ? "" : "s"} found.${
                ambiguousCount > 0
                  ? `  ${clarifiedCount} of ${ambiguousCount} flagged item${ambiguousCount === 1 ? "" : "s"} clarified.`
                  : ""
              }`}
        </p>
      </div>

      <div className="space-y-3">
        {parsed.exercises.map((ex, i) => {
          const match = ex.library_match_id
            ? getExerciseById(ex.library_match_id)
            : null;
          const contraHits = findContraindications({
            libraryId: match?.id,
            name: ex.name,
          });
          return (
            <Card key={i} className="space-y-3">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-display text-[18px] text-ink-primary">
                    {ex.name}
                  </p>
                  {ex.description ? (
                    <p className="mt-1 text-[14px] text-ink-secondary">
                      {ex.description}
                    </p>
                  ) : null}
                </div>
                <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
                  {match ? (
                    <TagPill tone="sage">matched · tier {match.tier}</TagPill>
                  ) : (
                    <TagPill tone="neutral">custom</TagPill>
                  )}
                  {ex.asymmetric_cues ? (
                    <TagPill tone="sage">asymmetric</TagPill>
                  ) : null}
                  {contraHits.some((h) => h.rule.category === "absolute") ? (
                    <TagPill tone="terracotta">flagged</TagPill>
                  ) : contraHits.length > 0 ? (
                    <TagPill tone="terracotta">worth checking</TagPill>
                  ) : null}
                </div>
              </div>

              {contraHits.length > 0 ? (
                <ContraindicationFlags hits={contraHits} />
              ) : null}

              {ex.asymmetric_cues ? (
                <p className="text-[13px] text-sage-dark">
                  {ex.asymmetric_cues}
                </p>
              ) : null}

              <div className="flex flex-wrap gap-3 pt-1">
                {ex.reps != null ? (
                  <Counter label="reps" value={ex.reps} />
                ) : null}
                {ex.sets != null ? (
                  <Counter label="sets" value={ex.sets} />
                ) : null}
                {ex.duration_seconds != null ? (
                  <Counter
                    label="hold"
                    value={`${ex.duration_seconds}s`}
                  />
                ) : null}
                {ex.frequency ? (
                  <Counter label="frequency" value={ex.frequency} />
                ) : null}
              </div>

              {ex.physio_specific_cues.length > 0 ? (
                <div className="pt-1">
                  <SectionLabel>Physio cues</SectionLabel>
                  <ul className="mt-2 space-y-1 text-[14px] text-ink-secondary">
                    {ex.physio_specific_cues.map((c, j) => (
                      <li key={j}>· {c}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {ex.ambiguities.length > 0 ? (
                <div className="rounded-2xl border border-drift/40 bg-terracotta-wash px-4 py-3 space-y-3">
                  <div>
                    <p className="text-[12px] font-medium uppercase tracking-[0.14em] text-terracotta-dark/80">
                      Worth confirming
                    </p>
                    <ul className="mt-1 space-y-0.5 text-[14px] text-ink-primary">
                      {ex.ambiguities.map((a, j) => (
                        <li key={j}>· {a}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="space-y-1">
                    <label
                      htmlFor={`clarify-${i}`}
                      className="text-[12px] font-medium text-ink-secondary"
                    >
                      Anything to clarify? (Saved with the exercise so I get
                      it right.)
                    </label>
                    <textarea
                      id={`clarify-${i}`}
                      rows={2}
                      value={clarifications[i] ?? ""}
                      onChange={(e) => onClarification(i, e.target.value)}
                      placeholder="e.g. left side; 12 reps; 3x per week"
                      className="w-full resize-none rounded-input border border-border bg-surface px-3 py-2 text-[14px] text-ink-primary placeholder:text-ink-tertiary focus:border-sage focus:shadow-focus-sage focus:outline-none"
                    />
                  </div>
                </div>
              ) : null}

              {ex.source_text ? (
                <p className="text-[12px] text-ink-tertiary italic">
                  &ldquo;{ex.source_text}&rdquo;
                </p>
              ) : null}
            </Card>
          );
        })}
      </div>

      {parsed.lifestyle_notes.length > 0 ? (
        <div className="space-y-2">
          <SectionLabel>Your physio also said</SectionLabel>
          <Card tone="sage">
            <ul className="space-y-2 text-[14px] text-ink-primary/85">
              {parsed.lifestyle_notes.map((n, i) => (
                <li key={i}>
                  <span className="font-medium text-ink-primary">
                    {n.category}:
                  </span>{" "}
                  {n.note}
                </li>
              ))}
            </ul>
          </Card>
        </div>
      ) : null}

      {parsed.parse_note ? (
        <p className="text-[12px] text-ink-tertiary italic">
          {parsed.parse_note}
        </p>
      ) : null}
    </div>
  );
}

function ContraindicationFlags({ hits }: { hits: RuleHit[] }) {
  return (
    <div className="space-y-2">
      {hits.map((h, i) => {
        const tone =
          h.rule.category === "absolute"
            ? {
                wrap: "border-drift bg-terracotta-wash",
                pillTone: "terracotta" as const,
                pillLabel: "Absolute — your physio's call",
              }
            : h.rule.category === "relative"
              ? {
                  wrap: "border-drift/50 bg-terracotta-wash/70",
                  pillTone: "terracotta" as const,
                  pillLabel: "Relative — handle with care",
                }
              : {
                  wrap: "border-border bg-base",
                  pillTone: "neutral" as const,
                  pillLabel: "Worth asking your physio",
                };
        return (
          <div
            key={i}
            className={"rounded-2xl border px-4 py-3 space-y-1.5 " + tone.wrap}
          >
            <div className="flex items-start gap-2">
              <ShieldAlert
                size={15}
                strokeWidth={1.6}
                className="mt-0.5 shrink-0 text-terracotta-dark"
              />
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[14px] font-medium text-ink-primary">
                    {h.rule.title}
                  </p>
                  <TagPill tone={tone.pillTone}>{tone.pillLabel}</TagPill>
                </div>
                <p className="text-[13px] text-ink-secondary">
                  {h.rule.reason_user_facing}
                </p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Counter({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl bg-base px-4 py-2">
      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-ink-secondary/80">
        {label}
      </p>
      <p className="font-mono text-[15px] text-ink-primary">{value}</p>
    </div>
  );
}
