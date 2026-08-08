"use client";

// The fortnightly timed check-in.
//
// This is the feedback loop the camera could not carry. A stopwatch, five
// holds, and one number the user can feel moving. The side-bridge ratio is
// the headline because it measures the asymmetry scoliosis actually produces,
// it responds to training within weeks, and nothing about it depends on where
// the phone was standing.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Heading } from "@/components/ui/Heading";
import { SectionLabel } from "@/components/ui/SectionLabel";
import {
  sideBridgeRatio,
  type CheckIn,
  type EnduranceResult,
  type EnduranceTest,
} from "@/lib/outcomes/compute";

const TESTS: {
  id: EnduranceTest;
  label: string;
  how: string;
}[] = [
  {
    id: "side_bridge_left",
    label: "Side bridge — left",
    how: "Left elbow and forearm down, hips lifted, body in a straight line. Stop when your hips drop.",
  },
  {
    id: "side_bridge_right",
    label: "Side bridge — right",
    how: "Same on the right. Try not to look at the clock — it changes how long you last.",
  },
  {
    id: "sorensen",
    label: "Back extensor hold",
    how: "Upper body unsupported off the end of a bed, hands across the chest, held level.",
  },
  {
    id: "single_leg_balance_left",
    label: "Balance — left leg",
    how: "Stand on the left leg, eyes closed. Stop when you put the other foot down.",
  },
  {
    id: "single_leg_balance_right",
    label: "Balance — right leg",
    how: "Same on the right.",
  },
];

export default function CheckInPage() {
  const [idx, setIdx] = useState(0);
  const [results, setResults] = useState<EnduranceResult[]>([]);
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const startedAt = useRef(0);
  const raf = useRef<number | null>(null);

  useEffect(() => {
    if (!running) return;
    const tick = () => {
      setElapsed((performance.now() - startedAt.current) / 1000);
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current !== null) cancelAnimationFrame(raf.current);
    };
  }, [running]);

  const done = idx >= TESTS.length;
  const current = done ? null : TESTS[idx];

  function start() {
    startedAt.current = performance.now();
    setElapsed(0);
    setRunning(true);
  }

  function stop(endedOnForm: boolean) {
    setRunning(false);
    if (!current) return;
    const seconds = (performance.now() - startedAt.current) / 1000;
    setResults((r) => [
      ...r,
      { test: current.id, seconds: Math.round(seconds * 10) / 10, endedOnForm },
    ]);
    setElapsed(0);
    setIdx((i) => i + 1);
  }

  const checkIn: CheckIn = { at: 0, results };
  const ratio = sideBridgeRatio(checkIn);

  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-[620px] flex-col gap-6 px-5 py-8">
        <div>
          <SectionLabel>Every two weeks</SectionLabel>
          <Heading level={1} className="mt-2">
            Timed check-in
          </Heading>
          <p className="mt-3 text-[16px] leading-relaxed text-ink-secondary">
            Five holds, timed. These move on a scale of weeks, and unlike a
            posture scan you&apos;ll feel them change before the numbers say so.
          </p>
        </div>

        {current ? (
          <Card className="flex flex-col gap-5 p-6">
            <SectionLabel>
              {idx + 1} of {TESTS.length}
            </SectionLabel>
            <Heading level={2}>{current.label}</Heading>
            <p className="text-[15px] leading-relaxed text-ink-secondary">
              {current.how}
            </p>

            <p
              className="font-mono text-[44px] tabular-nums leading-none text-ink-primary"
              aria-live="off"
            >
              {elapsed.toFixed(1)}
              <span className="ml-1 text-[20px] text-ink-tertiary">s</span>
            </p>

            {running ? (
              <div className="flex flex-wrap gap-3">
                <Button onClick={() => stop(false)}>I couldn&apos;t hold it</Button>
                <Button variant="secondary" onClick={() => stop(true)}>
                  My form broke first
                </Button>
              </div>
            ) : (
              <Button onClick={start}>Start</Button>
            )}

            <p className="text-[13px] leading-relaxed text-ink-tertiary">
              Recording why you stopped matters — a hold that ends because your
              form gave way is a different result from one that ends because
              the muscle did.
            </p>
          </Card>
        ) : null}

        {results.length > 0 ? (
          <Card className="flex flex-col divide-y divide-border/70 p-0">
            {results.map((r) => {
              const label = TESTS.find((t) => t.id === r.test)?.label ?? r.test;
              return (
                <div
                  key={r.test}
                  className="flex items-baseline justify-between gap-4 px-5 py-4"
                >
                  <span className="text-[15px] text-ink-primary">{label}</span>
                  <span className="font-mono text-[15px] tabular-nums text-ink-primary">
                    {r.seconds.toFixed(1)}s
                    {r.endedOnForm ? (
                      <span className="ml-2 text-[13px] text-ink-tertiary">
                        form
                      </span>
                    ) : null}
                  </span>
                </div>
              );
            })}
          </Card>
        ) : null}

        {done && ratio ? (
          <Card className="flex flex-col gap-4 p-6">
            <SectionLabel>Your headline number</SectionLabel>
            <p className="font-mono text-[40px] tabular-nums leading-none text-ink-primary">
              {(ratio.ratio * 100).toFixed(0)}%
            </p>
            <p className="text-[15px] leading-relaxed text-ink-secondary">
              {ratio.symmetric
                ? "Your two sides are holding for about the same time. That's what you're aiming to keep."
                : `Your ${ratio.weakerSide} side gives out first — it's lasting ${(ratio.ratio * 100).toFixed(0)}% as long as the other. Closing that gap is the thing to watch.`}
            </p>
            <p className="text-[13.5px] leading-relaxed text-ink-tertiary">
              One check-in is a baseline, not a trend. Repeat in two weeks and
              the direction starts to mean something.
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
