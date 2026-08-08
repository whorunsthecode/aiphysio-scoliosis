"use client";

// Magic-link sign-in. No passwords to store, reset, or leak — which for a
// product holding pain logs and X-rays is the right default.

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Heading } from "@/components/ui/Heading";
import { Input } from "@/components/ui/Input";
import {
  getBrowserClient,
  isSupabaseConfiguredClient,
} from "@/lib/supabase/client";

type Status =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "sent"; email: string }
  | { kind: "error"; message: string };

function SignInForm() {
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  const configured = isSupabaseConfiguredClient();

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) return;

    setStatus({ kind: "sending" });
    try {
      const next = params.get("next") ?? "/";
      const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
      const { error } = await getBrowserClient().auth.signInWithOtp({
        email: trimmed,
        options: { emailRedirectTo: redirectTo },
      });
      if (error) {
        setStatus({ kind: "error", message: error.message });
        return;
      }
      setStatus({ kind: "sent", email: trimmed });
    } catch (err) {
      setStatus({
        kind: "error",
        message: err instanceof Error ? err.message : "Could not send the link.",
      });
    }
  }

  if (!configured) {
    return (
      <Card className="p-8">
        <Heading level={2}>Running without an account</Heading>
        <p className="mt-3 text-[15px] leading-relaxed text-ink-secondary">
          Supabase isn&apos;t configured, so Balance is saving everything to this
          browser only. Every feature works — nothing syncs across devices, and
          clearing site data clears your history.
        </p>
        <a href="/" className="mt-6 inline-block">
          <Button variant="secondary">Continue on this device</Button>
        </a>
      </Card>
    );
  }

  if (status.kind === "sent") {
    return (
      <Card className="p-8">
        <Heading level={2}>Check your email</Heading>
        <p className="mt-3 text-[15px] leading-relaxed text-ink-secondary">
          A sign-in link is on its way to{" "}
          <span className="font-medium text-ink-primary">{status.email}</span>.
          It expires in an hour, and opening it on this device keeps you signed
          in here.
        </p>
        <button
          type="button"
          onClick={() => setStatus({ kind: "idle" })}
          className="mt-6 text-[14px] text-ink-tertiary underline underline-offset-2 hover:text-ink-secondary"
        >
          Use a different address
        </button>
      </Card>
    );
  }

  return (
    <Card className="p-8">
      <Heading level={2}>Sign in to Balance</Heading>
      <p className="mt-3 text-[15px] leading-relaxed text-ink-secondary">
        We&apos;ll email you a link. No password to remember.
      </p>

      <form onSubmit={send} className="mt-6 flex flex-col gap-3">
        <label htmlFor="email" className="sr-only">
          Email address
        </label>
        <Input
          id="email"
          type="email"
          name="email"
          autoComplete="email"
          required
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          invalid={status.kind === "error"}
          disabled={status.kind === "sending"}
        />
        <Button type="submit" disabled={status.kind === "sending" || !email.trim()}>
          {status.kind === "sending" ? "Sending…" : "Email me a link"}
        </Button>
      </form>

      {status.kind === "error" ? (
        <p role="alert" className="mt-4 text-[14px] text-drift">
          {status.message}
        </p>
      ) : null}

      <p className="mt-6 text-[13px] leading-relaxed text-ink-tertiary">
        Your posture history, pain logs and any X-rays you upload are visible
        only to you.
      </p>
    </Card>
  );
}

export default function SignInPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[460px] flex-col justify-center px-5 py-16">
      <Suspense fallback={null}>
        <SignInForm />
      </Suspense>
    </main>
  );
}
