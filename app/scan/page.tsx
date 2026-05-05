"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Heading } from "@/components/ui/Heading";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { Card } from "@/components/ui/Card";

// MediaPipe + camera APIs are browser-only — disable SSR for the scanner.
const PoseScanner = dynamic(
  () => import("@/components/pose/PoseScanner").then((m) => m.PoseScanner),
  { ssr: false },
);

export default function ScanPage() {
  return (
    <main className="mx-auto max-w-6xl px-6 py-12 lg:px-12 lg:py-16 space-y-10">
      <header className="space-y-3">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-[13px] text-ink-secondary transition-colors hover:text-ink-primary"
        >
          <ArrowLeft size={14} strokeWidth={1.5} />
          Home
        </Link>
        <SectionLabel>30-second assessment · MediaPipe Pose · virtual sticker overlay</SectionLabel>
        <Heading level={1}>Posture scan</Heading>
        <p className="max-w-2xl text-ink-secondary">
          Stand 1.5–2 m from the camera, facing it square-on. Loose clothing
          off, hands at your sides. I&rsquo;ll watch your alignment live and let
          you capture a snapshot when you&rsquo;re ready.
        </p>
      </header>

      <PoseScanner />

      <Card tone="muted" className="text-[13px] text-ink-secondary">
        Measurements are estimated from webcam pose landmarks and normalised to
        an assumed 500&nbsp;mm torso length. They supplement, not replace,
        clinical assessment.{" "}
        <span className="text-sage-dark font-medium">
          Your physio&rsquo;s measurements remain the source of truth.
        </span>{" "}
        Flag anything concerning at your next appointment.
      </Card>
    </main>
  );
}
