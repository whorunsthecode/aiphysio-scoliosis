"use client";

// Guided Adams forward-bend measurement.
//
// One level at a time, because a person bent forward with a phone on their
// back cannot read a screen. Each step is announced before they bend, the
// reading is taken from a stable window, and the result is shown when they
// stand up.
//
// Two setup steps precede the first reading, both borrowed from the Bunnell
// scoliometer protocol: a zero check with the phone flat on a table (consumer
// accelerometers carry 0.5–2° of offset), and a record of which way the phone
// is pointed — the sensor cannot know which of the patient's sides is "up".

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Heading } from "@/components/ui/Heading";
import { SectionLabel } from "@/components/ui/SectionLabel";
import {
  MAX_BEND_DEPTH_DEG,
  MIN_SAMPLES,
  SAMPLE_DELAY_MS,
  SAMPLE_WINDOW_MS,
  TRUNK_LEVELS,
  captureAtr,
  summarise,
  type AtrReading,
  type OrientationSample,
  type TopPointedTo,
  type TrunkLevel,
} from "@/lib/atr/compute";
import { saveAtrPeak } from "@/lib/atr/storage";
import {
  detectTiltSupport,
  requestTiltPermission,
  type TiltSupport,
} from "@/lib/pose/tilt";
import { cn } from "@/lib/cn";

type Phase =
  | { kind: "intro" }
  | { kind: "unsupported" }
  | { kind: "zero" }
  | { kind: "zeroing" }
  | { kind: "orientation" }
  | { kind: "ready"; idx: number }
  | { kind: "sampling"; idx: number }
  | { kind: "rejected"; idx: number; reason: string }
  | { kind: "done" };

const REJECTION_COPY: Record<string, string> = {
  adjust_bend:
    "That level of your back wasn't horizontal. Bend a little more or a little less until the phone sits level front-to-back, then try again.",
  moved_during_reading:
    "You moved while I was reading. Once you're bent forward, breathe normally and hold still until the phone says it's done.",
  too_few_samples: "I didn't get a long enough reading. Try that level again.",
  no_sensor:
    "This device isn't reporting its orientation, so it can't be used as an inclinometer.",
};

function median(xs: number[]): number {
  const a = [...xs].sort((p, q) => p - q);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

export default function AtrPage() {
  const [support, setSupport] = useState<TiltSupport>("unsupported");
  const [phase, setPhase] = useState<Phase>({ kind: "intro" });
  const [readings, setReadings] = useState<AtrReading[]>([]);
  const [zeroOffsetDeg, setZeroOffsetDeg] = useState<number | null>(null);
  const [topPointedTo, setTopPointedTo] = useState<TopPointedTo | null>(null);
  const samplesRef = useRef<OrientationSample[]>([]);
  const listeningRef = useRef(false);

  useEffect(() => setSupport(detectTiltSupport()), []);

  const onOrientation = useCallback((e: DeviceOrientationEvent) => {
    if (!listeningRef.current) return;
    samplesRef.current.push({ beta: e.beta, gamma: e.gamma });
  }, []);

  useEffect(() => {
    window.addEventListener("deviceorientation", onOrientation);
    return () => window.removeEventListener("deviceorientation", onOrientation);
  }, [onOrientation]);

  async function begin() {
    if (support === "unsupported") {
      setPhase({ kind: "unsupported" });
      return;
    }
    if (support === "needs_permission") {
      const granted = await requestTiltPermission();
      if (!granted) {
        setPhase({ kind: "unsupported" });
        return;
      }
    }
    setReadings([]);
    setZeroOffsetDeg(null);
    setTopPointedTo(null);
    setPhase({ kind: "zero" });
  }

  // Collect a window of samples after a settle delay, so the tap that starts
  // the reading (which tilts the phone) is not part of the measurement.
  function sampleWindow(onDone: (samples: OrientationSample[]) => void) {
    samplesRef.current = [];
    window.setTimeout(() => {
      listeningRef.current = true;
      window.setTimeout(() => {
        listeningRef.current = false;
        onDone(samplesRef.current);
      }, SAMPLE_WINDOW_MS);
    }, SAMPLE_DELAY_MS);
  }

  function takeZero() {
    setPhase({ kind: "zeroing" });
    sampleWindow((samples) => {
      const betas = samples
        .map((s) => s.beta)
        .filter((b): b is number => typeof b === "number" && Number.isFinite(b));
      if (betas.length < MIN_SAMPLES) {
        // Skip the correction rather than block the measurement; a zero of 0
        // is what the old flow assumed anyway.
        setZeroOffsetDeg(0);
      } else {
        setZeroOffsetDeg(median(betas));
      }
      setPhase({ kind: "orientation" });
    });
  }

  function takeReading(idx: number) {
    if (!topPointedTo) {
      setPhase({ kind: "orientation" });
      return;
    }
    const pointed = topPointedTo;
    setPhase({ kind: "sampling", idx });
    sampleWindow((samples) => {
      const level = TRUNK_LEVELS[idx].id as TrunkLevel;
      const result = captureAtr(level, samples, {
        topPointedTo: pointed,
        zeroOffsetDeg: zeroOffsetDeg ?? 0,
      });

      if (!result.ok) {
        setPhase({ kind: "rejected", idx, reason: result.reason });
        return;
      }
      setReadings((prev) => [...prev, result.reading]);
      if (idx + 1 >= TRUNK_LEVELS.length) setPhase({ kind: "done" });
      else setPhase({ kind: "ready", idx: idx + 1 });
    });
  }

  const summary = summarise(readings);
  const windowSeconds = Math.round((SAMPLE_DELAY_MS + SAMPLE_WINDOW_MS) / 1000);

  // Keep the latest peak (side + degrees, nothing else) so the session page
  // can cross-check it against the self-reported convex side.
  useEffect(() => {
    if (phase.kind !== "done" || !summary.peak) return;
    saveAtrPeak({
      at: new Date().toISOString(),
      peakDeg: summary.peak.deg,
      level: summary.peak.level,
    });
  }, [phase.kind, summary.peak]);

  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-[620px] flex-col gap-6 px-5 py-8">
        <div>
          <SectionLabel>Forward-bend check</SectionLabel>
          <Heading level={1} className="mt-2">
            Trunk rotation
          </Heading>
          <p className="mt-3 text-[16px] leading-relaxed text-ink-secondary">
            This is the measurement your physio takes with a scoliometer. Your
            phone does the same job — it reads a slope against gravity, so
            there&apos;s no camera, no guessing, and no assumptions about your
            body.
          </p>
        </div>

        {phase.kind === "intro" ? (
          <Card className="flex flex-col gap-4 p-6">
            <p className="text-[15px] leading-relaxed text-ink-secondary">
              You&apos;ll need someone to help — one person bends, the other
              holds the phone. Four levels down the back, about {windowSeconds}{" "}
              seconds each.
            </p>
            <ol className="flex list-decimal flex-col gap-2 pl-5 text-[15px] leading-relaxed text-ink-secondary">
              <li>Bend forward from the hips, arms hanging, knees straight, feet together.</li>
              <li>
                Your helper lays the phone flat across your back, screen up,
                square to your spine, camera end always pointing the same way.
              </li>
              <li>
                Bend until the level being measured is horizontal — your helper
                adjusts how far you bend, not the phone.
              </li>
              <li>Breathe normally and hold still until the phone says it&apos;s done.</li>
            </ol>
            <Button onClick={begin}>Start</Button>
            {support === "unsupported" ? (
              <p className="text-[14px] text-ink-tertiary">
                This device may not report orientation — most laptops
                don&apos;t. Use a phone.
              </p>
            ) : null}
          </Card>
        ) : null}

        {phase.kind === "unsupported" ? (
          <Card className="p-6">
            <p className="text-[15px] leading-relaxed text-ink-secondary">
              {REJECTION_COPY.no_sensor} Try again on a phone, and allow motion
              access when asked.
            </p>
          </Card>
        ) : null}

        {phase.kind === "zero" || phase.kind === "zeroing" ? (
          <Card className="flex flex-col gap-4 p-6">
            <SectionLabel>Before you start</SectionLabel>
            <Heading level={2}>Zero the phone</Heading>
            <p className="text-[15px] leading-relaxed text-ink-secondary">
              Lay the phone flat on a table, screen up, and leave it alone. A
              phone&apos;s tilt sensor is usually a degree or two off, and that
              would show up as a curve that isn&apos;t there.
            </p>
            {phase.kind === "zeroing" ? (
              <p role="status" className="text-[15px] font-medium text-ink-primary">
                Reading — don&apos;t touch it…
              </p>
            ) : (
              <Button onClick={takeZero}>It&apos;s on the table</Button>
            )}
          </Card>
        ) : null}

        {phase.kind === "orientation" ? (
          <Card className="flex flex-col gap-4 p-6">
            <SectionLabel>Before you start</SectionLabel>
            <Heading level={2}>Which way is the phone pointing?</Heading>
            <p className="text-[15px] leading-relaxed text-ink-secondary">
              When the phone lies across your back, the camera end points to
              one of <em>your</em> sides. Keep it that way for all four levels.
            </p>
            <div className="grid grid-cols-2 gap-3">
              {(["right", "left"] as const).map((side) => (
                <button
                  key={side}
                  type="button"
                  onClick={() => {
                    setTopPointedTo(side);
                    setPhase({ kind: "ready", idx: 0 });
                  }}
                  className={cn(
                    "rounded-card border px-4 py-4 text-left text-[15px] transition-colors hover:border-sage focus:outline-none focus:shadow-focus-sage",
                    topPointedTo === side ? "border-sage bg-sage/10" : "border-border bg-surface",
                  )}
                >
                  <span className="block font-medium text-ink-primary">
                    Camera end to my {side}
                  </span>
                </button>
              ))}
            </div>
          </Card>
        ) : null}

        {phase.kind === "ready" || phase.kind === "sampling" || phase.kind === "rejected" ? (
          <Card className="flex flex-col gap-4 p-6">
            <SectionLabel>
              Level {phase.idx + 1} of {TRUNK_LEVELS.length}
            </SectionLabel>
            <Heading level={2}>{TRUNK_LEVELS[phase.idx].label}</Heading>
            <p className="text-[15px] leading-relaxed text-ink-secondary">
              {TRUNK_LEVELS[phase.idx].hint}
            </p>

            {phase.kind === "sampling" ? (
              <p
                role="status"
                className="text-[15px] font-medium text-ink-primary"
              >
                Reading — breathe normally, hold still…
              </p>
            ) : (
              <Button onClick={() => takeReading(phase.idx)}>
                {phase.kind === "rejected" ? "Try this level again" : "Take reading"}
              </Button>
            )}

            {phase.kind === "rejected" ? (
              <p role="alert" className="text-[14.5px] leading-relaxed text-terracotta-dark">
                {REJECTION_COPY[phase.reason] ?? "That reading didn't hold. Try again."}
              </p>
            ) : null}

            <p className="text-[13px] text-ink-tertiary">
              The level being measured must be roughly horizontal — more than{" "}
              {MAX_BEND_DEPTH_DEG}° of front-to-back slope and I&apos;ll ask you
              to adjust the bend rather than guess.
            </p>
          </Card>
        ) : null}

        {readings.length > 0 ? (
          <Card className="flex flex-col divide-y divide-border/70 p-0">
            {readings.map((r) => {
              const label =
                TRUNK_LEVELS.find((l) => l.id === r.level)?.label ?? r.level;
              const side = r.deg > 0 ? "right" : "left";
              return (
                <div
                  key={r.level}
                  className="flex items-baseline justify-between px-5 py-4"
                >
                  <span className="text-[15px] text-ink-primary">{label}</span>
                  <span className="font-mono text-[15px] tabular-nums text-ink-primary">
                    {Math.abs(r.deg).toFixed(1)}°{" "}
                    <span className="text-ink-tertiary">{side} up</span>
                  </span>
                </div>
              );
            })}
          </Card>
        ) : null}

        {phase.kind === "done" ? (
          <Card
            className={cn(
              "flex flex-col gap-4 p-6",
              summary.band === "refer" ? "border-drift" : undefined,
            )}
          >
            <Heading level={2}>What that means</Heading>
            <p className="text-[15px] leading-relaxed text-ink-secondary">
              {summary.message}
            </p>
            <p className="text-[13.5px] leading-relaxed text-ink-tertiary">
              A single reading isn&apos;t a trend. Repeat this every few weeks,
              same helper, same time of day, and the number becomes useful.
            </p>
            <Link href="/">
              <Button variant="secondary">Done</Button>
            </Link>
          </Card>
        ) : null}
      </div>
    </AppShell>
  );
}
