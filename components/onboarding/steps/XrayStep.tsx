"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
import { Input } from "@/components/ui/Input";
import { Chip } from "@/components/ui/Chip";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { StepNav } from "@/components/onboarding/StepNav";
import type {
  ApexRegion,
  CurveType,
  OnboardingState,
  SegmentShift,
  Side,
} from "@/lib/onboarding/types";
import type { XrayAnalysis } from "@/lib/prompts/xray";

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
type ConfirmFields = {
  curveType: CurveType;
  primaryApex: ApexRegion | null;
  primaryLean: Side | null;
  cobbRange: string;
  hasSecondary: boolean;
  secondaryApex: ApexRegion | null;
  secondaryLean: Side | null;
  segments: {
    cervical: SegmentShift | null;
    upperThoracic: SegmentShift | null;
    lowerThoracic: SegmentShift | null;
    lumbar: SegmentShift | null;
  };
};

const APEX_OPTIONS: { id: ApexRegion; label: string }[] = [
  { id: "cervical", label: "Cervical" },
  { id: "upper_thoracic", label: "Upper thoracic" },
  { id: "lower_thoracic", label: "Lower thoracic" },
  { id: "thoracolumbar", label: "Thoracolumbar" },
  { id: "lumbar", label: "Lumbar" },
];

const SHIFT_OPTIONS: { id: SegmentShift; label: string }[] = [
  { id: "left", label: "Left" },
  { id: "right", label: "Right" },
  { id: "centered", label: "Centered" },
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
            : `Parser returned status ${res.status}`;
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
    } catch (e) {
      update({
        xray: {
          ...state.xray,
          parseStatus: "error",
          parseError: e instanceof Error ? e.message : "Network error",
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
    update({
      curveType: confirmed.curveType,
      primaryCurveApex: confirmed.primaryApex,
      primaryLeanSide: confirmed.primaryLean,
      secondaryCurveApex: confirmed.hasSecondary ? confirmed.secondaryApex : null,
      secondaryLeanSide: confirmed.hasSecondary ? confirmed.secondaryLean : null,
      segmentShifts: {
        cervical: confirmed.segments.cervical,
        upper_thoracic: confirmed.segments.upperThoracic,
        lower_thoracic: confirmed.segments.lowerThoracic,
        lumbar: confirmed.segments.lumbar,
      },
      xray: { ...state.xray, applied: true },
    });
  };

  return (
    <div className="space-y-10">
      <div className="space-y-3">
        <Heading level={1}>Got an X-ray?</Heading>
        <p className="text-ink-secondary max-w-xl">
          Optional. If you have one, drop it here and I&rsquo;ll read what I
          can. You&rsquo;ll always confirm against your physio&rsquo;s notes
          before anything is saved to your profile.
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
            JPG, PNG, or WEBP · stays on your device until you finish
            onboarding
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
  applied,
  onApply,
}: {
  analysis: XrayAnalysis;
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
    const safeSide = (s: "left" | "right" | "unclear"): Side | null =>
      s === "unclear" ? null : s;
    const segMap = (
      v: "left" | "right" | "neutral" | "unclear",
    ): SegmentShift | null =>
      v === "neutral" ? "centered" : v === "unclear" ? null : v;
    return {
      curveType: ct,
      primaryApex: safeApex(a.primary_curve.apex_region),
      primaryLean: safeSide(a.primary_curve.convex_side),
      cobbRange: a.primary_curve.estimated_cobb_range || "",
      hasSecondary: !!a.secondary_curve,
      secondaryApex: a.secondary_curve
        ? safeApex(a.secondary_curve.apex_region)
        : null,
      secondaryLean: a.secondary_curve
        ? safeSide(a.secondary_curve.convex_side)
        : null,
      segments: {
        cervical: segMap(a.segmental_shift_impression.segment_I_cervical),
        upperThoracic: segMap(
          a.segmental_shift_impression.segment_II_upper_thoracic,
        ),
        lowerThoracic: segMap(
          a.segmental_shift_impression.segment_III_lower_thoracic,
        ),
        lumbar: segMap(a.segmental_shift_impression.segment_IV_lumbar),
      },
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
          That doesn&rsquo;t look like a scoliosis X-ray.
        </p>
        <p className="text-[14px] text-ink-secondary">
          {analysis.validity_note ||
            "I couldn’t read this as a back X-ray. You can skip — no harm done."}
        </p>
      </Card>
    );
  }

  const set = (patch: Partial<ConfirmFields>) =>
    setFields((p) => ({ ...p, ...patch }));
  const setSeg = (
    key: keyof ConfirmFields["segments"],
    value: SegmentShift | null,
  ) =>
    setFields((p) => ({
      ...p,
      segments: { ...p.segments, [key]: value },
    }));

  return (
    <Card className="space-y-7">
      <div className="flex items-start justify-between gap-4">
        <div>
          <SectionLabel>What I&rsquo;m reading</SectionLabel>
          <p className="mt-2 text-[14px] text-ink-secondary max-w-md">
            Here&rsquo;s what I&rsquo;m reading from your X-ray — please confirm
            against your physio&rsquo;s notes before saving. Edit anything that
            doesn&rsquo;t match, then apply.
          </p>
        </div>
        {applied ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-sage-tint px-3 py-1.5 text-[13px] font-medium text-sage-dark">
            <CheckCircle2 size={14} strokeWidth={1.8} /> Applied
          </span>
        ) : null}
      </div>

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
          </div>
        </div>
        <div className="space-y-3">
          <SectionLabel>Estimated Cobb (primary)</SectionLabel>
          <Input
            value={fields.cobbRange}
            placeholder="e.g. 20–25°"
            onChange={(e) => set({ cobbRange: e.target.value })}
          />
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
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <div className="space-y-4 border-t border-border/60 pt-6">
        <SectionLabel>Segmental shift</SectionLabel>
        <div className="space-y-3">
          {(
            [
              { key: "cervical", label: "I · Cervical" },
              { key: "upperThoracic", label: "II · Upper thoracic" },
              { key: "lowerThoracic", label: "III · Lower thoracic" },
              { key: "lumbar", label: "IV · Lumbar" },
            ] as {
              key: keyof ConfirmFields["segments"];
              label: string;
            }[]
          ).map((seg) => (
            <div key={seg.key} className="flex items-center justify-between gap-3">
              <span className="text-[14px] text-ink-primary">{seg.label}</span>
              <div className="flex flex-wrap gap-2">
                {SHIFT_OPTIONS.map((opt) => (
                  <Chip
                    key={opt.id}
                    selected={fields.segments[seg.key] === opt.id}
                    onClick={() => setSeg(seg.key, opt.id)}
                  >
                    {opt.label}
                  </Chip>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {analysis.confidence_note ? (
        <p className="text-[13px] text-ink-tertiary italic border-t border-border/60 pt-5">
          {analysis.confidence_note}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3 pt-2">
        <Button variant="primary" onClick={() => onApply(fields)}>
          {applied ? "Apply again" : "Save these confirmed values"}
        </Button>
        <Button variant="ghost" onClick={() => setFields(initial)}>
          Reset to AI suggestion
        </Button>
      </div>
    </Card>
  );
}
