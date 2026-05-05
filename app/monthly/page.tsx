"use client";

// Monthly test — Adam's forward-bend assessment. Step-by-step instructions
// matching the reference UI. The actual capture flow is deferred to v2.5
// (per the spec); for now this page lays out what the user should do, with
// a "Begin test" button that takes them to a quick scan as a placeholder.

import Link from "next/link";
import { Camera, Info } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Heading } from "@/components/ui/Heading";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

const STEPS: { title: string; body: string }[] = [
  {
    title: "Dress & position",
    body: "Wear a fitted top. Stand feet together, knees straight. Prop your phone on a stable surface at hip height, about 1.5 m behind you.",
  },
  {
    title: "Start the camera",
    body: "Tap Begin test. The camera will open. Stand in front of it so your full back is visible.",
  },
  {
    title: "Bend forward",
    body: "When the countdown starts, slowly bend forward until your back is roughly horizontal and your hands hang toward the floor. Hold still.",
  },
  {
    title: "Stay still",
    body: "Hold the position for the full countdown. The app captures the frame automatically at zero.",
  },
];

export default function MonthlyTestPage() {
  return (
    <AppShell>
      <main className="mx-auto max-w-3xl px-6 py-12 lg:px-12 lg:py-16 space-y-8">
        <header className="space-y-2">
          <SectionLabel>Monthly rib hump assessment</SectionLabel>
          <Heading level={1}>Adam&rsquo;s forward-bend test</Heading>
        </header>

        <Card tone="sage" className="flex items-start gap-3">
          <Info
            size={16}
            strokeWidth={1.5}
            className="mt-0.5 shrink-0 text-sage-dark"
          />
          <p className="text-[14px] text-ink-primary/85">
            Bending forward makes rib hump asymmetry protrude — this is the
            same assessment physios use between X-rays to track curve
            progression. Capturing it monthly gives you clinically meaningful
            trend data.
          </p>
        </Card>

        <ol className="space-y-4">
          {STEPS.map((step, i) => (
            <li key={i} className="flex items-start gap-4">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-sage-tint font-display text-[15px] text-sage-dark">
                {i + 1}
              </span>
              <div className="space-y-0.5 pt-1">
                <p className="font-display text-[16px] text-ink-primary">
                  {step.title}
                </p>
                <p className="text-[14px] text-ink-secondary">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>

        <Card tone="muted" className="text-[12px] text-ink-tertiary">
          Full capture flow with rib-hump silhouette analysis ships in v2.5.
          For now, &ldquo;Begin test&rdquo; opens the standard posture scan
          so you can hold the bend manually. Side-by-side monthly comparison
          lands once silhouette diff is wired.
        </Card>

        <div className="flex justify-center">
          <Link href="/scan">
            <Button
              variant="primary"
              size="lg"
              leftIcon={<Camera size={18} strokeWidth={1.5} />}
            >
              Begin test
            </Button>
          </Link>
        </div>
      </main>
    </AppShell>
  );
}
