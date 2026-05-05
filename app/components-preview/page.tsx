"use client";

import { useState } from "react";
import {
  Activity,
  ArrowRight,
  Camera,
  CheckCircle2,
  ClipboardList,
  Clock,
  Dumbbell,
  Flame,
  Heart,
  Home as HomeIcon,
  LineChart,
  ScanLine,
  Sparkles,
  TrendingUp,
  User,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Card } from "@/components/ui/Card";
import { Input, Textarea } from "@/components/ui/Input";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { Heading } from "@/components/ui/Heading";
import { MetricBadge } from "@/components/ui/MetricBadge";
import { TagPill } from "@/components/ui/TagPill";
import { StatCard } from "@/components/ui/StatCard";

const curveOptions = [
  { id: "right-thoracic", label: "Right thoracic" },
  { id: "left-thoracic", label: "Left thoracic" },
  { id: "left-lumbar", label: "Left lumbar" },
  { id: "right-lumbar", label: "Right lumbar" },
  { id: "double-rt-ll", label: "Double major (right thoracic / left lumbar)" },
  { id: "double-lt-rl", label: "Double major (left thoracic / right lumbar)" },
  { id: "thoracolumbar", label: "Thoracolumbar" },
  { id: "other", label: "Other" },
];

const apexOptions = [
  { id: "cervical", label: "Cervical" },
  { id: "upper-thoracic", label: "Upper thoracic" },
  { id: "lower-thoracic", label: "Lower thoracic" },
  { id: "thoracolumbar", label: "Thoracolumbar" },
  { id: "lumbar", label: "Lumbar" },
];

const filterOptions = [
  "all",
  "strength",
  "flexibility",
  "breathing",
  "balance",
  "derotation",
];

export default function ComponentsPreviewPage() {
  const [curve, setCurve] = useState<string>("double-rt-ll");
  const [apexes, setApexes] = useState<Set<string>>(new Set(["lower-thoracic"]));
  const [filter, setFilter] = useState<string>("all");
  const [progress, setProgress] = useState<number>(45);

  const toggleApex = (id: string) => {
    setApexes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="flex min-h-screen">
      {/* Sidebar (illustrative — shown so primitives sit in their real frame) */}
      <aside className="hidden w-60 shrink-0 border-r border-border/60 bg-base px-6 py-9 lg:flex lg:flex-col">
        <p className="font-display text-[22px] text-sage-dark">Balance</p>
        <nav className="mt-9 flex flex-col gap-1 text-[15px]">
          <SidebarItem icon={<HomeIcon size={17} strokeWidth={1.5} />} label="Home" />
          <SidebarItem icon={<ScanLine size={17} strokeWidth={1.5} />} label="Check-in" active />
          <SidebarItem icon={<Dumbbell size={17} strokeWidth={1.5} />} label="Exercises" />
          <SidebarItem icon={<ClipboardList size={17} strokeWidth={1.5} />} label="Monthly test" />
          <SidebarItem icon={<LineChart size={17} strokeWidth={1.5} />} label="Progress" />
          <SidebarItem icon={<Users size={17} strokeWidth={1.5} />} label="Care team" />
          <SidebarItem icon={<User size={17} strokeWidth={1.5} />} label="Profile" />
        </nav>
        <p className="mt-auto pt-12 text-[12px] text-ink-tertiary">
          Works alongside your care team.
        </p>
      </aside>

      <main className="flex-1 px-6 py-12 lg:px-14 lg:py-16 max-w-[1100px]">
        {/* Page header */}
        <header className="space-y-3">
          <SectionLabel>Visual identity preview</SectionLabel>
          <Heading level={1}>Component primitives</Heading>
          <p className="max-w-2xl text-ink-secondary">
            The shared building blocks that drive every screen. Warm palette,
            soft shapes, Fraunces for headings, Inter for body, JetBrains Mono
            for numbers inside cards.
          </p>
        </header>

        <div className="mt-14 space-y-16">
          {/* Stat cards */}
          <Section title="Stat cards" sublabel="Hero numbers — Fraunces serif on warm white">
            <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
              <StatCard
                icon={<Activity size={18} strokeWidth={1.5} />}
                value="3"
                label="Sessions"
              />
              <StatCard
                icon={<Clock size={18} strokeWidth={1.5} />}
                value="42"
                label="Minutes moved"
                sublabel="this week"
              />
              <StatCard
                icon={<Flame size={18} strokeWidth={1.5} />}
                value="7"
                label="Day streak"
                status="active"
              />
              <StatCard
                icon={<TrendingUp size={18} strokeWidth={1.5} />}
                value="76"
                label="Posture score"
                sublabel="avg alignment"
                tone="sage"
              />
            </div>
          </Section>

          {/* Headings */}
          <Section title="Headings" sublabel="Fraunces, weights 400–500, optical-sized">
            <div className="space-y-5">
              <Heading level={1}>Good to see you, karmen.</Heading>
              <Heading level={2}>How are you feeling today?</Heading>
              <Heading level={3}>Today&rsquo;s exercises</Heading>
            </div>
          </Section>

          {/* Body type */}
          <Section title="Body & UI text" sublabel="Inter for everything that isn’t a heading or a number">
            <div className="space-y-3 max-w-2xl">
              <p className="text-[18px]">
                Body text at 17–18px, line-height 1.6, warm deep brown ink. Reads
                calm, not clinical.
              </p>
              <p className="text-ink-secondary">
                Secondary tone for supporting copy. Notice the warm undertone —
                never a cool grey.
              </p>
              <p className="text-ink-tertiary text-[15px]">
                Tertiary, for hints and disabled states.
              </p>
            </div>
          </Section>

          {/* Buttons */}
          <Section title="Buttons" sublabel="Pill-shaped, soft hover lift">
            <div className="flex flex-wrap items-center gap-4">
              <Button variant="primary">Let&rsquo;s get started</Button>
              <Button
                variant="primary"
                rightIcon={<ArrowRight size={18} strokeWidth={1.5} />}
              >
                Continue
              </Button>
              <Button
                variant="primary"
                leftIcon={<Sparkles size={18} strokeWidth={1.5} />}
              >
                Run Coach now
              </Button>
              <Button variant="secondary">Skip for now</Button>
              <Button
                variant="secondary"
                leftIcon={<Camera size={18} strokeWidth={1.5} />}
              >
                Upload X-ray
              </Button>
              <Button variant="ghost">Maybe later</Button>
              <Button variant="primary" disabled>
                Disabled
              </Button>
            </div>
            <div className="mt-6 flex flex-wrap items-center gap-4">
              <Button variant="primary" size="lg">
                Large primary
              </Button>
              <Button variant="secondary" size="lg">
                Large secondary
              </Button>
            </div>
          </Section>

          {/* Pill chips (filters) */}
          <Section
            title="Pill chips"
            sublabel="Quick selectors — used for filters and small option groups"
          >
            <div className="space-y-6">
              <div className="space-y-3">
                <SectionLabel>Category</SectionLabel>
                <div className="flex flex-wrap gap-3">
                  {filterOptions.map((opt) => (
                    <Chip
                      key={opt}
                      selected={filter === opt}
                      onClick={() => setFilter(opt)}
                    >
                      {opt}
                    </Chip>
                  ))}
                </div>
              </div>
              <div className="space-y-3">
                <SectionLabel>Curve apex (multi-select)</SectionLabel>
                <div className="flex flex-wrap gap-3">
                  {apexOptions.map((opt) => (
                    <Chip
                      key={opt.id}
                      selected={apexes.has(opt.id)}
                      onClick={() => toggleApex(opt.id)}
                    >
                      {opt.label}
                    </Chip>
                  ))}
                </div>
              </div>
              <div className="space-y-3">
                <SectionLabel>With icons</SectionLabel>
                <div className="flex flex-wrap gap-3">
                  <Chip selected icon={<Heart size={16} strokeWidth={1.5} />}>
                    Mild
                  </Chip>
                  <Chip icon={<Sparkles size={16} strokeWidth={1.5} />}>
                    Moderate
                  </Chip>
                  <Chip icon={<Flame size={16} strokeWidth={1.5} />}>Severe</Chip>
                </div>
              </div>
            </div>
          </Section>

          {/* Card chips (option grid) */}
          <Section
            title="Option-card chips"
            sublabel="Roomy rectangles — used in onboarding when each option needs space to breathe"
          >
            <div className="space-y-3">
              <SectionLabel>Curve type</SectionLabel>
              <div className="grid gap-3 sm:grid-cols-2">
                {curveOptions.map((opt) => (
                  <Chip
                    key={opt.id}
                    variant="card"
                    selected={curve === opt.id}
                    onClick={() => setCurve(opt.id)}
                  >
                    {opt.label}
                  </Chip>
                ))}
              </div>
            </div>
          </Section>

          {/* Tag pills */}
          <Section title="Tag pills" sublabel="Small tonal labels — sage, terracotta, neutral">
            <div className="flex flex-wrap items-center gap-2">
              <TagPill tone="sage">flexibility</TagPill>
              <TagPill tone="sage">Concave side</TagPill>
              <TagPill tone="sage">Both sides</TagPill>
              <TagPill tone="terracotta">strength</TagPill>
              <TagPill tone="terracotta">Convex side</TagPill>
              <TagPill tone="terracotta">Asymmetric</TagPill>
              <TagPill tone="neutral">breathing</TagPill>
              <TagPill tone="neutral">balance</TagPill>
            </div>
          </Section>

          {/* Cards */}
          <Section
            title="Cards"
            sublabel="Soft shadow on warm white. Sage-solid for hero CTAs, washes for grouped sections."
          >
            <div className="space-y-4">
              <Card tone="sage-solid" className="flex items-center gap-5">
                <div className="grid h-12 w-12 place-items-center rounded-2xl bg-white/15">
                  <Sparkles size={22} strokeWidth={1.5} className="text-white" />
                </div>
                <div className="flex-1">
                  <p className="font-display text-[22px] leading-tight">
                    Start today&rsquo;s session
                  </p>
                  <p className="text-[14px] text-white/80">
                    Pain check-in → posture scan → tailored exercises → re-scan
                  </p>
                </div>
                <ArrowRight size={20} strokeWidth={1.5} className="text-white" />
              </Card>

              <div className="grid gap-4 md:grid-cols-2">
                <Card className="flex items-center gap-4">
                  <div className="grid h-12 w-12 place-items-center rounded-2xl bg-sage-tint text-sage-dark">
                    <ScanLine size={20} strokeWidth={1.5} />
                  </div>
                  <div>
                    <p className="text-[16px] font-medium text-ink-primary">
                      Quick scan
                    </p>
                    <p className="text-[13px] text-ink-tertiary">
                      Standalone posture check
                    </p>
                  </div>
                </Card>
                <Card className="flex items-center gap-4">
                  <div className="grid h-12 w-12 place-items-center rounded-2xl bg-sage-tint text-sage-dark">
                    <Dumbbell size={20} strokeWidth={1.5} />
                  </div>
                  <div>
                    <p className="text-[16px] font-medium text-ink-primary">
                      Exercise library
                    </p>
                    <p className="text-[13px] text-ink-tertiary">
                      8 exercises available
                    </p>
                  </div>
                </Card>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <Card>
                  <SectionLabel>How I can help</SectionLabel>
                  <p className="mt-3 text-ink-primary">
                    Guide you through exercises tailored to your curve. Watch
                    your form gently, the way a physio would.
                  </p>
                </Card>
                <Card tone="sage">
                  <SectionLabel>Today&rsquo;s practice</SectionLabel>
                  <p className="mt-3 text-ink-primary">
                    Three exercises selected for how you&rsquo;re standing today.
                  </p>
                </Card>
                <Card tone="terracotta">
                  <SectionLabel>What I&rsquo;m not</SectionLabel>
                  <p className="mt-3 text-ink-primary">
                    Not a replacement for your physio. Their notes always win.
                  </p>
                </Card>
              </div>
            </div>
          </Section>

          {/* Inputs */}
          <Section title="Inputs" sublabel="Soft border, sage focus glow, no harsh ring">
            <div className="space-y-5 max-w-xl">
              <div className="space-y-2">
                <SectionLabel>Name</SectionLabel>
                <Input placeholder="Your name" defaultValue="karmen" />
              </div>
              <div className="space-y-2">
                <SectionLabel>Physio program</SectionLabel>
                <Textarea
                  rows={5}
                  placeholder="Any format — informal notes, bullet points, photos transcribed. I’ll figure it out."
                />
              </div>
              <div className="space-y-2">
                <SectionLabel>Cobb angle — primary (°)</SectionLabel>
                <Input type="number" placeholder="e.g. 22" />
              </div>
              <div className="space-y-2">
                <SectionLabel>Invalid state (soft coral, never harsh red)</SectionLabel>
                <Input invalid placeholder="Looks off" defaultValue="??" />
              </div>
            </div>
          </Section>

          {/* Progress */}
          <Section title="Progress" sublabel="Pill-cap ends, sage fill on warm grey track">
            <div className="space-y-6 max-w-xl">
              <div className="space-y-2">
                <SectionLabel>Onboarding — step 4 of 7</SectionLabel>
                <ProgressBar value={progress} />
              </div>
              <div className="flex items-center gap-3">
                <Button
                  variant="secondary"
                  onClick={() => setProgress((p) => Math.max(0, p - 15))}
                >
                  − 15
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => setProgress((p) => Math.min(100, p + 15))}
                >
                  + 15
                </Button>
              </div>
              <div className="space-y-2">
                <SectionLabel>Drift indicator (terracotta tone)</SectionLabel>
                <ProgressBar value={28} tone="terracotta" />
              </div>
            </div>
          </Section>

          {/* Metric badges */}
          <Section
            title="Metric badges"
            sublabel="Small mono-numeral chips for rep / set / hold counts"
          >
            <Card>
              <div className="flex flex-wrap items-end gap-8">
                <MetricBadge value="10" label="reps" />
                <MetricBadge value="3" label="sets" />
                <MetricBadge value="30" unit="s" label="hold" />
                <MetricBadge value="45" unit="s" label="hold" size="lg" />
                <MetricBadge
                  value="6"
                  unit="mm"
                  label="hip drift"
                  tone="terracotta"
                />
              </div>
            </Card>
          </Section>

          {/* Composition example */}
          <Section
            title="Composition example"
            sublabel="What an exercise card looks like with primitives composed together"
          >
            <Card>
              <div className="flex items-start justify-between gap-6">
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <TagPill tone="terracotta">strength</TagPill>
                    <TagPill tone="sage">Concave side</TagPill>
                  </div>
                  <Heading level={2}>Hip bridge with pelvic press-down</Heading>
                  <p className="text-ink-secondary max-w-lg mt-1">
                    Press the left side of the pelvis down into the floor as you
                    lift. Even hip height at the top — no anterior tilt.
                  </p>
                </div>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-sage-tint px-3 py-1.5 text-[13px] font-medium text-sage-dark">
                  <CheckCircle2 size={14} strokeWidth={1.8} /> Cleared by your
                  physio
                </span>
              </div>
              <div className="mt-8 flex flex-wrap items-center gap-8">
                <MetricBadge value="10" label="reps" />
                <MetricBadge value="3" label="sets" />
                <MetricBadge value="2.5" unit="min" label="estimated" />
                <div className="ml-auto flex gap-3">
                  <Button variant="ghost">Show cues</Button>
                  <Button
                    variant="primary"
                    rightIcon={<ArrowRight size={18} strokeWidth={1.5} />}
                  >
                    Begin
                  </Button>
                </div>
              </div>
            </Card>
          </Section>
        </div>
      </main>
    </div>
  );
}

function Section({
  title,
  sublabel,
  children,
}: {
  title: string;
  sublabel?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-5">
      <div>
        <Heading level={3}>{title}</Heading>
        {sublabel ? (
          <p className="mt-1 text-[14px] text-ink-secondary">{sublabel}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function SidebarItem({
  icon,
  label,
  active,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
}) {
  return (
    <div
      className={cnSidebar(
        "flex items-center gap-3 rounded-full px-4 py-2.5 transition-colors",
        active
          ? "bg-sage-tint text-sage-dark"
          : "text-ink-secondary hover:bg-sage-wash hover:text-ink-primary",
      )}
    >
      <span>{icon}</span>
      <span>{label}</span>
    </div>
  );
}

function cnSidebar(...c: (string | undefined | false | null)[]): string {
  return c.filter(Boolean).join(" ");
}
