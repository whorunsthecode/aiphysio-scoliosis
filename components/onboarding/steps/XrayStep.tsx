"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { NETWORK_ERROR, publicError } from "@/lib/errors";
import {
  AlertCircle,
  CheckCircle2,
  ImageIcon,
  Loader2,
  UploadCloud,
  X,
} from "lucide-react";
import { Heading } from "@/components/ui/Heading";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { StepNav } from "@/components/onboarding/StepNav";
import type {
  ApexRegion,
  CurveType,
  OnboardingState,
  Side,
} from "@/lib/onboarding/types";
import type { XrayAnalysis } from "@/lib/prompts/xray";
import { reconcileConvexity } from "@/lib/exercises/convexity";

interface XrayStepProps {
  state: OnboardingState;
  update: (patch: Partial<OnboardingState>) => void;
  onBack: () => void;
  onNext: () => void;
  onSkip: () => void;
}

// Editable confirmation state — initialized from the model output, then any
// override by the user wins. We never write `analysis` directly to the
// profile; only this confirmed shape gets applied.
//
// What is NOT here, on purpose: a Cobb angle (a phone photo of a film cannot
// be measured), segmental shift and rotation (not readable by a vision
// model from a photo). Those come from the clinician's report, or the
// segment step, or nowhere.
type ConfirmFields = {
  curveType: CurveType;
  primaryApex: ApexRegion | null;
  primaryLean: Side | null;
  hasSecondary: boolean;
  secondaryApex: ApexRegion | null;
  secondaryLean: Side | null;
};

const APEX_OPTIONS: { id: ApexRegion; label: string }[] = [
  { id: "cervical", label: "Cervical" },
  { id: "upper_thoracic", label: "Upper thoracic" },
  { id: "lower_thoracic", label: "Lower thoracic" },
  { id: "thoracolumbar", label: "Thoracolumbar" },
  { id: "lumbar", label: "Lumbar" },
];

export function XrayStep({
  state,
  update,
  onBack,
  onNext,
  onSkip,
}: XrayStepProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setDragging] = useState(false);

  const handleFile = (file: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = typeof reader.result === "string" ? reader.result : null;
      update({
        xray: {
          ...state.xray,
          fileName: file.name,
          fileSize: file.size,
          dataUrl,
          parsed: null,
          parseStatus: dataUrl ? "loading" : "idle",
          parseError: null,
          applied: false,
        },
      });
      if (!dataUrl) return;
      await runParse(dataUrl);
    };
    reader.readAsDataURL(file);
  };

  const runParse = async (dataUrl: string) => {
    try {
      const res = await fetch("/api/xray", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataUrl }),
      });
      const json = (await res.json()) as
        | { ok: true; analysis: XrayAnalysis }
        | { ok: false; error: string; configured?: boolean };

      if (!res.ok || !json.ok) {
        const msg =
          "error" in json
            ? json.error
            : publicError("xray", res.status);
        update({
          xray: {
            ...state.xray,
            parseStatus: "error",
            parseError: msg,
          },
        });
        return;
      }

      update({
        xray: {
          ...state.xray,
          parsed: json.analysis,
          parseStatus: "ok",
          parseError: null,
        },
      });
    } catch {
      update({
        xray: {
          ...state.xray,
          parseStatus: "error",
          parseError: NETWORK_ERROR,
        },
      });
    }
  };

  const clear = () =>
    update({
      xray: {
        fileName: null,
        fileSize: null,
        dataUrl: null,
        parsed: null,
        parseStatus: "idle",
        parseError: null,
        applied: false,
      },
    });

  const applyConfirmed = (confirmed: ConfirmFields) => {
    // Cross-check the X-ray side against what the user said on the curve
    // step. Two sources disagreeing is exactly the case where guessing is
    // dangerous, so the side goes to null and the conflict is recorded.
    const verdict = reconcileConvexity([
      { source: "self_report", side: state.primaryLeanSide },
      { source: "xray", side: confirmed.primaryLean },
    ]);
    const conflict =
      verdict.status === "conflict" && state.primaryLeanSide && confirmed.primaryLean
        ? { selfReport: state.primaryLeanSide, xray: confirmed.primaryLean }
        : null;

    update({
      curveType: confirmed.curveType,
      primaryCurveApex: confirmed.primaryApex,
      primaryLeanSide: verdict.side,
      sideConflict: conflict,
      secondaryCurveApex: confirmed.hasSecondary ? confirmed.secondaryApex : null,
      secondaryLeanSide: confirmed.hasSecondary ? confirmed.secondaryLean : null,
      xray: { ...state.xray, applied: true },
    });
  };

  return (
    <div className="space-y-10">
      <div className="space-y-3">
        <Heading level={1}>Got an X-ray?</Heading>
        <p className="text-ink-secondary max-w-xl">
          Optional. If you have one, drop it here and I&rsquo;ll read what I
          can — which is less than you might expect. Everything I read is
          unverified until you&rsquo;ve checked it against your
          clinician&rsquo;s report.
        </p>
      </div>

      {!state.xray.dataUrl ? (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            handleFile(e.dataTransfer.files?.[0] ?? null);
          }}
          className={
            "rounded-card border-2 border-dashed bg-surface px-8 py-16 text-center transition-colors " +
            (isDragging
              ? "border-sage bg-sage-wash"
              : "border-border hover:border-sage/60 hover:bg-sage-wash/40")
          }
        >
          <div className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-sage-tint text-sage-dark">
            <UploadCloud size={26} strokeWidth={1.5} />
          </div>
          <p className="mt-4 font-display text-[20px] text-ink-primary">
            Drop your X-ray here
          </p>
          <p className="mt-1 text-[14px] text-ink-secondary">
            JPG, PNG, or WEBP · front-on view · stays on your device until you
            finish onboarding
          </p>
          <div className="mt-6">
            <Button
              variant="secondary"
              onClick={() => inputRef.current?.click()}
            >
              Choose a file
            </Button>
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
            />
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          <Card className="space-y-5">
            <div className="flex items-start gap-5">
              <div className="h-32 w-32 shrink-0 overflow-hidden rounded-2xl bg-base ring-1 ring-border">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={state.xray.dataUrl}
                  alt="Uploaded X-ray preview"
                  className="h-full w-full object-cover"
                />
              </div>
              <div className="flex-1 space-y-1">
                <div className="flex items-center gap-2 text-ink-primary">
                  <ImageIcon
                    size={16}
                    strokeWidth={1.5}
                    className="text-sage-dark"
                  />
                  <span className="text-[15px]">{state.xray.fileName}</span>
                </div>
                <p className="text-[13px] text-ink-tertiary">
                  {state.xray.fileSize
                    ? `${(state.xray.fileSize / 1024).toFixed(1)} KB`
                    : null}
                </p>
              </div>
              <button
                type="button"
                onClick={clear}
                aria-label="Remove file"
                className="rounded-full p-2 text-ink-secondary transition-colors hover:bg-base hover:text-ink-primary"
              >
                <X size={16} strokeWidth={1.5} />
              </button>
            </div>
          </Card>

          {state.xray.parseStatus === "loading" ? (
            <ParseStatusCard
              tone="loading"
              title="Reading your X-ray…"
              body="Just a moment — Gemini is looking at the image."
            />
          ) : null}

          {state.xray.parseStatus === "error" && state.xray.parseError ? (
            <ParseStatusCard
              tone="error"
              title="I couldn&rsquo;t read this one."
              body={state.xray.parseError}
              action={
                <Button
                  variant="secondary"
                  onClick={() =>
                    state.xray.dataUrl && runParse(state.xray.dataUrl)
                  }
                >
                  Try again
                </Button>
              }
            />
          ) : null}

          {state.xray.parseStatus === "ok" && state.xray.parsed ? (
            <EditableXrayPanel
              key={state.xray.fileName ?? "xray"}
              analysis={state.xray.parsed}
              selfReportedSide={state.primaryLeanSide}
              applied={state.xray.applied}
              onApply={applyConfirmed}
            />
          ) : null}
        </div>
      )}

      <StepNav onBack={onBack} onNext={onNext} onSkip={onSkip} />
    </div>
  );
}

function ParseStatusCard({
  tone,
  title,
  body,
  action,
}: {
  tone: "loading" | "error";
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  const Icon = tone === "loading" ? Loader2 : AlertCircle;
  return (
    <Card
      tone={tone === "error" ? "terracotta" : "sage"}
      className="flex items-start gap-4"
    >
      <div
        className={
          "mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full " +
          (tone === "loading"
            ? "bg-white/70 text-sage-dark"
            : "bg-white/70 text-terracotta-dark")
        }
      >
        <Icon
          size={18}
          strokeWidth={1.5}
          className={tone === "loading" ? "animate-spin" : ""}
        />
      </div>
      <div className="flex-1 space-y-1">
        <p className="font-display text-[17px] text-ink-primary">{title}</p>
        <p className="text-[14px] text-ink-secondary">{body}</p>
        {action ? <div className="pt-3">{action}</div> : null}
      </div>
    </Card>
  );
}

function EditableXrayPanel({
  analysis,
  selfReportedSide,
  applied,
  onApply,
}: {
  analysis: XrayAnalysis;
  selfReportedSide: Side | null;
  applied: boolean;
  onApply: (confirmed: ConfirmFields) => void;
}) {
  const initial = useMemo<ConfirmFields>(() => {
    const a = analysis.curve_assessment;
    const ct: CurveType =
      a.curve_type === "S-curve"
        ? "S"
        : a.curve_type === "C-curve"
          ? "C"
          : a.curve_type === "thoracolumbar"
            ? "thoracolumbar"
            : "unknown";
    const safeApex = (
      r: XrayAnalysis["curve_assessment"]["primary_curve"]["apex_region"],
    ): ApexRegion | null => (r === "unclear" ? null : (r as ApexRegion));
    // Without a laterality marker the side is not evidence, whatever the
    // model returned. The API enforces this too; this is the UI's copy.
    const safeSide = (s: "left" | "right" | "unclear"): Side | null =>
      !analysis.laterality_marker_visible || s === "unclear" ? null : s;
    return {
      curveType: ct,
      primaryApex: safeApex(a.primary_curve.apex_region),
      primaryLean: safeSide(a.primary_curve.convex_side),
      hasSecondary: !!a.secondary_curve,
      secondaryApex: a.secondary_curve
        ? safeApex(a.secondary_curve.apex_region)
        : null,
      secondaryLean: a.secondary_curve
        ? safeSide(a.secondary_curve.convex_side)
        : null,
    };
  }, [analysis]);

  const [fields, setFields] = useState<ConfirmFields>(initial);

  // If the user uploads a new X-ray (component remounted via key), the local
  // state resets via useMemo + initial state.
  useEffect(() => {
    setFields(initial);
  }, [initial]);

  if (!analysis.is_valid_xray) {
    return (
      <Card tone="terracotta" className="space-y-2">
        <p className="font-display text-[18px] text-ink-primary">
          That doesn&rsquo;t look like a spine X-ray.
        </p>
        <p className="text-[14px] text-ink-secondary">
          {analysis.validity_note ||
            "I couldn’t read this as a back X-ray. You can skip — no harm done."}
        </p>
      </Card>
    );
  }

  if (analysis.view_type === "lateral") {
    return (
      <Card tone="terracotta" className="space-y-2">
        <p className="font-display text-[18px] text-ink-primary">
          That&rsquo;s a side-on view.
        </p>
        <p className="text-[14px] text-ink-secondary">
          A lateral film shows the spine from the side, which can&rsquo;t show
          which way a scoliosis curve goes. If you have the front-on (PA or AP)
          film, upload that one instead. Otherwise skip — nothing is lost.
        </p>
      </Card>
    );
  }

  const set = (patch: Partial<ConfirmFields>) =>
    setFields((p) => ({ ...p, ...patch }));

  const sideConflict =
    selfReportedSide && fields.primaryLean && selfReportedSide !== fields.primaryLean;

  return (
    <Card className="space-y-7">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <SectionLabel>What I&rsquo;m reading</SectionLabel>
            <span className="inline-flex items-center rounded-full border border-drift/60 bg-terracotta-wash px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-[0.12em] text-terracotta-dark">
              AI-read · unverified
            </span>
          </div>
          <p className="mt-2 text-[14px] text-ink-secondary max-w-md">
            A rough read of the film, not a measurement. Check every field
            against your clinician&rsquo;s report, correct anything that
            doesn&rsquo;t match, then apply.
          </p>
        </div>
        {applied ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-sage-tint px-3 py-1.5 text-[13px] font-medium text-sage-dark">
            <CheckCircle2 size={14} strokeWidth={1.8} /> Applied
          </span>
        ) : null}
      </div>

      {!analysis.laterality_marker_visible ? (
        <Card tone="muted" className="space-y-1">
          <p className="text-[14px] font-medium text-ink-primary">
            No left/right marker visible, so I haven&rsquo;t read a side.
          </p>
          <p className="text-[13.5px] text-ink-secondary">
            A photo of an X-ray can be mirrored, and without the little
            &ldquo;L&rdquo; or &ldquo;R&rdquo; on the film there&rsquo;s no way to
            tell. Set the side from your clinician&rsquo;s report if you have it;
            otherwise leave it and I&rsquo;ll stay side-neutral.
            {analysis.laterality_marker_note
              ? ` (${analysis.laterality_marker_note})`
              : null}
          </p>
        </Card>
      ) : null}

      {analysis.other_observations.length > 0 ? (
        <Card tone="terracotta" className="space-y-2">
          <p className="text-[14px] font-medium text-ink-primary">
            Something on the film worth showing your doctor
          </p>
          <ul className="list-disc space-y-1 pl-5 text-[13.5px] text-ink-secondary">
            {analysis.other_observations.map((o, i) => (
              <li key={i}>{o}</li>
            ))}
          </ul>
          <p className="text-[12.5px] text-ink-tertiary">
            I can&rsquo;t say what it is and won&rsquo;t guess. It may be
            nothing. Please have a clinician look at the original film.
          </p>
        </Card>
      ) : null}

      <div className="space-y-3">
        <SectionLabel>Curve type</SectionLabel>
        <div className="flex flex-wrap gap-3">
          {(
            [
              { id: "S", label: "S-curve" },
              { id: "C", label: "C-curve" },
              { id: "thoracolumbar", label: "Thoracolumbar" },
              { id: "unknown", label: "Unsure" },
            ] as { id: CurveType; label: string }[]
          ).map((opt) => (
            <Chip
              key={opt.id}
              selected={fields.curveType === opt.id}
              onClick={() => set({ curveType: opt.id })}
            >
              {opt.label}
            </Chip>
          ))}
        </div>
      </div>

      <div className="grid gap-7 sm:grid-cols-2">
        <div className="space-y-3">
          <SectionLabel>Primary apex</SectionLabel>
          <div className="flex flex-wrap gap-2">
            {APEX_OPTIONS.map((opt) => (
              <Chip
                key={opt.id}
                selected={fields.primaryApex === opt.id}
                onClick={() => set({ primaryApex: opt.id })}
              >
                {opt.label}
              </Chip>
            ))}
          </div>
        </div>
        <div className="space-y-3">
          <SectionLabel>Primary bulges to</SectionLabel>
          <div className="flex flex-wrap gap-2">
            {(["left", "right"] as Side[]).map((s) => (
              <Chip
                key={s}
                selected={fields.primaryLean === s}
                onClick={() => set({ primaryLean: s })}
              >
                {s}
              </Chip>
            ))}
            <Chip
              selected={fields.primaryLean === null}
              onClick={() => set({ primaryLean: null })}
            >
              Unsure
            </Chip>
          </div>
          {sideConflict ? (
            <p className="text-[13px] leading-relaxed text-terracotta-dark">
              You said {selfReportedSide} on the curve step; this reads{" "}
              {fields.primaryLean}. If you apply as-is I&rsquo;ll set the side to
              unknown and keep your programme side-neutral until a clinician
              settles it.
            </p>
          ) : null}
        </div>
      </div>

      <div className="space-y-3 border-t border-border/60 pt-6">
        <div className="flex items-center justify-between">
          <SectionLabel>Secondary curve</SectionLabel>
          <button
            type="button"
            onClick={() => set({ hasSecondary: !fields.hasSecondary })}
            className="text-[13px] text-sage-dark hover:underline"
          >
            {fields.hasSecondary ? "Remove" : "Add a secondary curve"}
          </button>
        </div>
        {fields.hasSecondary ? (
          <div className="grid gap-7 sm:grid-cols-2">
            <div className="space-y-2">
              <SectionLabel>Secondary apex</SectionLabel>
              <div className="flex flex-wrap gap-2">
                {APEX_OPTIONS.map((opt) => (
                  <Chip
                    key={opt.id}
                    selected={fields.secondaryApex === opt.id}
                    onClick={() => set({ secondaryApex: opt.id })}
                  >
                    {opt.label}
                  </Chip>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <SectionLabel>Secondary bulges to</SectionLabel>
              <div className="flex flex-wrap gap-2">
                {(["left", "right"] as Side[]).map((s) => (
                  <Chip
                    key={s}
                    selected={fields.secondaryLean === s}
                    onClick={() => set({ secondaryLean: s })}
                  >
                    {s}
                  </Chip>
                ))}
                <Chip
                  selected={fields.secondaryLean === null}
                  onClick={() => set({ secondaryLean: null })}
                >
                  Unsure
                </Chip>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <p className="text-[13px] leading-relaxed text-ink-tertiary border-t border-border/60 pt-5">
        I don&rsquo;t estimate a Cobb angle from a photo — a film has to be
        measured on the original. Your clinician&rsquo;s report has the number;
        the severity band on the curve step is where it goes.
        {analysis.confidence_note ? (
          <span className="italic"> {analysis.confidence_note}</span>
        ) : null}
      </p>

      <div className="flex flex-wrap items-center gap-3 pt-2">
        <Button variant="primary" onClick={() => onApply(fields)}>
          {applied ? "Apply again" : "Save these confirmed values"}
        </Button>
        <Button variant="ghost" onClick={() => setFields(initial)}>
          Reset to AI read
        </Button>
      </div>
    </Card>
  );
}
