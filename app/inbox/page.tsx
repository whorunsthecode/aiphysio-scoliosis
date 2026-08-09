"use client";

// The in-app inbox — now the record of truth for everything the care team
// sends, replacing Telegram as the delivery surface.

import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Heading } from "@/components/ui/Heading";
import { SectionLabel } from "@/components/ui/SectionLabel";
import {
  getBrowserClient,
  isSupabaseConfiguredClient,
} from "@/lib/supabase/client";

type Note = {
  id: string;
  sent_by_agent: string;
  message_text: string;
  kind: string | null;
  document_path: string | null;
  sent_at: string;
  read_at: string | null;
};

const AGENT_LABEL: Record<string, string> = {
  coach: "Coach",
  companion: "Companion",
  liaison: "Physio handoff",
};

export default function InboxPage() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isSupabaseConfiguredClient()) {
      setLoading(false);
      return;
    }
    const { data, error: err } = await getBrowserClient()
      .from("notifications")
      .select("id, sent_by_agent, message_text, kind, document_path, sent_at, read_at")
      .order("sent_at", { ascending: false })
      .limit(50);
    if (err) setError(err.message);
    else setNotes((data ?? []) as Note[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function markRead(id: string) {
    setNotes((n) =>
      n.map((x) => (x.id === id ? { ...x, read_at: new Date().toISOString() } : x)),
    );
    await getBrowserClient()
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", id);
  }

  async function openDocument(id: string) {
    try {
      const res = await fetch("/api/inbox/document", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ notificationId: id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not open document");
      window.open(json.url, "_blank", "noopener,noreferrer");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open document");
    }
  }

  const unread = notes.filter((n) => !n.read_at).length;

  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-[620px] flex-col gap-6 px-5 py-8">
        <div>
          <SectionLabel>
            {unread > 0 ? `${unread} unread` : "Up to date"}
          </SectionLabel>
          <Heading level={1} className="mt-2">
            Inbox
          </Heading>
          <p className="mt-3 text-[16px] leading-relaxed text-ink-secondary">
            Everything your care team sends arrives here. Handoff documents stay
            in the app rather than being sent anywhere.
          </p>
        </div>

        {loading ? (
          <p className="text-[15px] text-ink-tertiary">Loading…</p>
        ) : null}

        {error ? (
          <p role="alert" className="text-[15px] text-terracotta-dark">
            {error}
          </p>
        ) : null}

        {!loading && notes.length === 0 ? (
          <Card className="p-6">
            <p className="text-[15px] leading-relaxed text-ink-secondary">
              Nothing yet. When Coach plans your week or Companion notices
              something, it&apos;ll show up here.
            </p>
          </Card>
        ) : null}

        {notes.map((n) => (
          <Card
            key={n.id}
            className={`flex flex-col gap-3 p-5 ${n.read_at ? "opacity-70" : ""}`}
          >
            <div className="flex items-baseline justify-between gap-4">
              <SectionLabel>
                {AGENT_LABEL[n.sent_by_agent] ?? n.sent_by_agent}
              </SectionLabel>
              <span className="font-mono text-[12px] tabular-nums text-ink-tertiary">
                {new Date(n.sent_at).toLocaleDateString()}
              </span>
            </div>

            <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-ink-primary">
              {n.message_text}
            </p>

            <div className="flex flex-wrap gap-3">
              {n.document_path ? (
                <Button onClick={() => openDocument(n.id)}>
                  Open document
                </Button>
              ) : null}
              {!n.read_at ? (
                <Button variant="ghost" onClick={() => markRead(n.id)}>
                  Mark read
                </Button>
              ) : null}
            </div>
          </Card>
        ))}
      </div>
    </AppShell>
  );
}
