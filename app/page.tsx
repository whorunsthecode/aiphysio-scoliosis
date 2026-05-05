import Link from "next/link";
import { Heading } from "@/components/ui/Heading";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-start justify-center gap-10 px-6 py-16">
      <div className="space-y-4">
        <p className="font-display text-[22px] text-sage-dark">Balance</p>
        <Heading level={1}>Hi — let&rsquo;s work on your back together.</Heading>
        <p className="max-w-xl text-lg text-ink-secondary">
          A movement coach for scoliosis. Tailored exercises, gentle form
          guidance, and longitudinal tracking — alongside your care team.
        </p>
      </div>

      <Card className="w-full">
        <p className="text-sm text-ink-secondary">
          Daily session orchestrates pain check, scan, exercises, and re-scan
          end to end. Onboard once to make it yours.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/session">
            <Button variant="primary">Today&rsquo;s practice</Button>
          </Link>
          <Link href="/onboarding">
            <Button variant="secondary">Start onboarding</Button>
          </Link>
          <Link href="/scan">
            <Button variant="secondary">Posture scan</Button>
          </Link>
          <Link href="/care-team">
            <Button variant="secondary">Care team</Button>
          </Link>
          <Link href="/progress">
            <Button variant="ghost">Progress</Button>
          </Link>
          <Link href="/library">
            <Button variant="ghost">Exercise library</Button>
          </Link>
          <Link href="/components-preview">
            <Button variant="ghost">Component primitives</Button>
          </Link>
        </div>
      </Card>
    </main>
  );
}
