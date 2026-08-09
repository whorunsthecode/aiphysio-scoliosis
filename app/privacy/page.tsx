"use client";

// Privacy controls. Access, erasure, and sign-out that actually clears the
// device — all three in one place, because a user looking for any of them is
// usually anxious and should not have to hunt.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Heading } from "@/components/ui/Heading";
import { Input } from "@/components/ui/Input";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { clearLocalHealthData } from "@/lib/privacy/data";
import {
  getBrowserClient,
  isSupabaseConfiguredClient,
} from "@/lib/supabase/client";

const CONFIRMATION = "DELETE MY DATA";

export default function PrivacyPage() {
  const router = useRouter();
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState<null | "export" | "delete" | "signout">(null);
  const [message, setMessage] = useState<string | null>(null);

  async function exportData() {
    setBusy("export");
    setMessage(null);
    try {
      const res = await fetch("/api/privacy/export");
      if (!res.ok) throw new Error(`Export failed (${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `balance-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Export failed.");
    } finally {
      setBusy(null);
    }
  }

  async function deleteData() {
    setBusy("delete");
    setMessage(null);
    try {
      const res = await fetch("/api/privacy/delete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirm }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Delete failed");
      clearLocalHealthData();
      setConfirm("");
      setMessage(json.note ?? "Your health data has been deleted.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Delete failed.");
    } finally {
      setBusy(null);
    }
  }

  async function signOut() {
    setBusy("signout");
    // Clear the device first. If the network call fails afterwards the local
    // copy is still gone, which is the outcome that matters on a shared or
    // borrowed device.
    clearLocalHealthData();
    try {
      if (isSupabaseConfiguredClient()) {
        await getBrowserClient().auth.signOut();
      }
    } catch {
      // Already cleared locally; nothing else to do.
    }
    router.push("/sign-in");
  }

  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-[620px] flex-col gap-6 px-5 py-8">
        <div>
          <SectionLabel>Your data</SectionLabel>
          <Heading level={1} className="mt-2">
            Privacy
          </Heading>
          <p className="mt-3 text-[16px] leading-relaxed text-ink-secondary">
            Everything here — your pain logs, your curve, your scans, anything
            you&apos;ve uploaded — is health data, and it&apos;s yours. You can
            take all of it with you or delete all of it, at any time, without
            asking anyone.
          </p>
        </div>

        <Card className="flex flex-col gap-4 p-6">
          <Heading level={2}>What&apos;s held, and where</Heading>
          <ul className="flex list-disc flex-col gap-2 pl-5 text-[15px] leading-relaxed text-ink-secondary">
            <li>
              Your profile, sessions, pain logs and any uploads are stored in a
              database where the access rules mean only your account can read
              them.
            </li>
            <li>
              Your device keeps a small copy of your profile and recent sessions
              so the app works offline. X-ray images and your safety answers are
              never kept on the device.
            </li>
            <li>
              When the app writes you a plan, clinical details go to a model
              provider — your curve pattern and pain scores, never your name,
              age or anything identifying.
            </li>
            <li>
              If you connect Telegram, messages pass through Telegram&apos;s
              servers. Anything you&apos;d rather they didn&apos;t hold, keep in
              the app.
            </li>
          </ul>
        </Card>

        <Card className="flex flex-col gap-4 p-6">
          <Heading level={2}>Take a copy</Heading>
          <p className="text-[15px] leading-relaxed text-ink-secondary">
            One file with everything held about you. Useful for your own
            records, or to show a physiotherapist.
          </p>
          <Button onClick={exportData} disabled={busy !== null}>
            {busy === "export" ? "Preparing…" : "Download my data"}
          </Button>
        </Card>

        <Card className="flex flex-col gap-4 p-6">
          <Heading level={2}>Sign out</Heading>
          <p className="text-[15px] leading-relaxed text-ink-secondary">
            Clears the copy on this device as well as ending the session —
            worth using if this isn&apos;t your own phone or computer.
          </p>
          <Button variant="secondary" onClick={signOut} disabled={busy !== null}>
            {busy === "signout" ? "Signing out…" : "Sign out and clear this device"}
          </Button>
        </Card>

        <Card className="flex flex-col gap-4 border-drift p-6">
          <Heading level={2}>Delete everything</Heading>
          <p className="text-[15px] leading-relaxed text-ink-secondary">
            Removes your profile, every session, every scan and every file,
            including anything you uploaded. This can&apos;t be undone, and
            there&apos;s no copy kept. Download your data first if you might
            want it.
          </p>
          <label htmlFor="confirm" className="text-[14px] text-ink-secondary">
            Type <span className="font-mono text-ink-primary">{CONFIRMATION}</span> to
            confirm
          </label>
          <Input
            id="confirm"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder={CONFIRMATION}
            autoComplete="off"
          />
          <Button
            onClick={deleteData}
            disabled={busy !== null || confirm !== CONFIRMATION}
          >
            {busy === "delete" ? "Deleting…" : "Delete my data permanently"}
          </Button>
        </Card>

        {message ? (
          <p role="status" className="text-[15px] leading-relaxed text-ink-primary">
            {message}
          </p>
        ) : null}
      </div>
    </AppShell>
  );
}
