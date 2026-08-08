"use client";

// Guided Adams forward-bend measurement.
//
// One level at a time, because a person bent forward with a phone on their
// back cannot read a screen. Each step is announced before they bend, the
// reading is taken from a stable window, and the result is shown when they
// stand up.

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Heading } from "@/components/ui/Heading";
import { SectionLabel } from "@/components/ui/SectionLabel";
import {
  MAX_ROLL_DEG,
  TRUNK_LEVELS,
  captureAtr,
  summarise,
  type AtrReading,
  type OrientationSample,
  type TrunkLevel,
} from "@/lib/atr/compute";
import {
  detectTiltSupport,
  requestTiltPermission,
  type TiltSupport,
} from "@/lib/pose/tilt";
import { cn } from "@/lib/cn";

const SAMPLE_MS = 2500;

type Phase =
  | { kind: "intro" }
  | { kind: "unsupported" }
  | { kind: "ready"; idx: number }
  | { kind: "sampling"; idx: number }
  | { kind: "rejected"; idx: number; reason: string }
  | { kind: "done" };

const REJECTION_COPY: Record<string, string> = {
  phone_not_flat:
    "The phone wasn't sitting flat across your back. Lay it down so both long edges touch, and try that level again.",
  moved_during_reading:
    "You moved while I was reading. Hold still for a slow count of three once you're bent forward.",
  too_few_samples: "I didn't get a long enough reading. Try that level again.",
  no_sensor:
    "This device isn't reporting its orientation, so it can't be used as an inclinometer.",
};

export default function AtrPage() {
  const [support, setSupport] = useState<TiltSupport>("unsupported");
  const [phase, setPhase] = useState<Phase>({ kind: "intro" });
  const [readings, setReadings] = useState<AtrReading[]>([]);
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
    setPhase({ kind: "ready", idx: 0 });
  }

  function takeReading(idx: number) {
    samplesRef.current = [];
    listeningRef.current = true;
    setPhase({ kind: "sampling", idx });

    window.setTimeout(() => {
      listeningRef.current = false;
      const level = TRUNK_LEVELS[idx].id as TrunkLevel;
      const result = captureAtr(level, samplesRef.current);

      if (!result.ok) {
        setPhase({ kind: "rejected", idx, reason: result.reason });
        return;
      }
      const next = [...readings, result.reading];
      setReadings(next);
      if (idx + 1 >= TRUNK_LEVELS.length) setPhase({ kind: "done" });
      else setPhase({ kind: "ready", idx: idx + 1 });
    }, SAMPLE_MS);
  }

  const summary = summarise(readings);

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
              holds the phone. Four levels down the back, a few seconds each.
            </p>
            <ol className="flex list-decimal flex-col gap-2 pl-5 text-[15px] leading-relaxed text-ink-secondary">
              <li>Bend forward from the hips until your back is horizontal.</li>
              <li>Arms hanging, knees straight, feet together.</li>
              <li>
                Your helper lays the phone flat across your back, screen up,
                square to your spine.
              </li>
              <li>Hold still for three seconds per level.</li>
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
                Reading — hold still…
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
              The phone must sit flat — more than {MAX_ROLL_DEG}° of roll and
              I&apos;ll ask you to redo it rather than guess.
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
              at a similar time of day, and the number becomes useful.
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
