import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { Heading } from "@/components/ui/Heading";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

export default function OnboardingCompletePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-start justify-center gap-8 px-6 py-16">
      <div className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-sage-tint text-sage-dark">
        <CheckCircle2 size={26} strokeWidth={1.5} />
      </div>
      <div className="space-y-3">
        <Heading level={1}>You&rsquo;re all set.</Heading>
        <p className="text-ink-secondary">
          Your profile is saved. From here, every check-in will tune itself to
          how you&rsquo;re standing today.
        </p>
      </div>
      <Card tone="muted" className="text-[14px] text-ink-secondary">
        Posture scan, exercise selection, and form-checking light up next.
        Until then you can browse the component primitives.
      </Card>
      <div className="flex gap-3">
        <Link href="/">
          <Button variant="primary">Go to home</Button>
        </Link>
        <Link href="/components-preview">
          <Button variant="ghost">Component primitives</Button>
        </Link>
      </div>
    </main>
  );
}
