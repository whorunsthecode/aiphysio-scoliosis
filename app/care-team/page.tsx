"use client";

// /care-team — admin / portfolio view of the multi-agent system.
//
// Coach panel (this week's program with reasoning + reasoning-per-change),
// Companion panel (recent nudges + observations + decision distribution),
// Liaison panel (upcoming appointments + past handoff docs),
// Tier 1 panel (baseline / correlations / cascade — the analysis layer),
// Inter-agent bus tail (last 20 messages).

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  CalendarClock,
  CheckCircle2,
  Compass,
  FileText,
  Heart,
  Loader2,
  MessageSquare,
  RefreshCw,
  Sparkles,
  Users,
  Zap,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/Card";
import { Heading } from "@/components/ui/Heading";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { TagPill } from "@/components/ui/TagPill";
import { Button } from "@/components/ui/Button";
import { StatCard } from "@/components/ui/StatCard";

type Profile = {
  id: string;
  name: string;
  curve_type: string | null;
};

type WeeklyProgram = {
  id: string;
  week_start: string;
  reasoning: string;
  is_active: boolean;
  generated_at: string;
  program_data: Record<
    string,
    { exercise_id: string; sets?: number; reps?: number; side_cue?: string }[]
  >;
};

type Notification = {
  id: string;
  sent_by_agent: string;
  message_text: string;
  sent_at: string;
};

type Observation = {
  id: string;
  observed_by_agent: string;
  observation_text: string;
  category: string | null;
  severity: string | null;
  used_in_handoff_id: string | null;
  created_at: string;
};

type Appointment = {
  id: string;
  appointment_at: string;
  notes: string | null;
  liaison_doc_id: string | null;
};

type LiaisonDoc = {
  id: string;
  appointment_id: string;
  pdf_storage_path: string;
  content_summary: {
    summary: string;
    questions_for_physio: string[];
  } | null;
  generated_at: string;
};

type CareTeamState = {
  ok: boolean;
  configured?: boolean;
  error?: string;
  profile: Profile | null;
  weeklyPrograms: WeeklyProgram[];
  notifications: Notification[];
  observations: Observation[];
  appointments: Appointment[];
  documents: LiaisonDoc[];
  cascade: {
    curve_pattern: string;
    active_stages: { stage: string; signal: string; value: number; threshold: number; description: string }[];
    predicted_next: { stage: string; description: string }[];
    reasoning: string;
    computed_at: string;
  } | null;
  correlations: {
    subject: string;
    object: string;
    lag_days: number;
    correlation_strength: number;
    confidence_low: number;
    confidence_high: number;
    evidence_count: number;
  }[];
  baseline: {
    sample_count: number;
    overall_score_mean: number | null;
    computed_at: string;
  } | null;
  messages: {
    id: string;
    from_agent: string;
    to_agent: string;
    message_type: string;
    status: string;
    created_at: string;
  }[];
  sessionsRecent: {
    started_at: string;
    scan_confidence: string | null;
    source: string | null;
  }[];
};

export default function CareTeamPage() {
  const [state, setState] = useState<CareTeamState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/care-team/state");
      const json = (await res.json()) as CareTeamState;
      setState(json);
      // Don't surface the 503 envelope as an error — render the setup card instead.
      if (!res.ok && json.configured !== false) {
        setError(json.error ?? `State endpoint returned ${res.status}`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const trigger = async (path: string, body?: unknown) => {
    setRunning(path);
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      const json = await res.json();
      if (!res.ok || json.ok === false) {
        setError(`${path}: ${json.error ?? json.reason ?? res.status}`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(null);
      void refresh();
    }
  };

  // All defensive: the 503 "Supabase not configured" envelope has none of
  // these fields. The SupabaseSetupCard branch handles that, but these
  // derivations run unconditionally so guard each one.
  const program = state?.weeklyPrograms?.[0] ?? null;
  const previousProgram = state?.weeklyPrograms?.[1] ?? null;
  const companionNudges =
    state?.notifications?.filter((n) => n.sent_by_agent === "companion") ?? [];
  const companionObservations = state?.observations ?? [];
  const upcomingAppts =
    state?.appointments?.filter(
      (a) => new Date(a.appointment_at).getTime() > Date.now(),
    ) ?? [];
  const pastDocs = state?.documents ?? [];

  return (
    <AppShell>
    <main className="mx-auto max-w-5xl px-6 py-12 lg:px-12 lg:py-16 space-y-12">
      <header className="space-y-2">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-1">
            <Heading level={1}>Care team</Heading>
            <p className="max-w-2xl text-ink-secondary">
              Three agents watching, planning, and reporting — so your physio
              gets the full picture.
            </p>
          </div>
          <Button
            variant="secondary"
            onClick={refresh}
            leftIcon={<RefreshCw size={14} strokeWidth={1.5} />}
          >
            Refresh
          </Button>
        </div>
      </header>

      {error ? (
        <Card tone="terracotta" className="flex items-start gap-3">
          <AlertCircle
            size={18}
            strokeWidth={1.6}
            className="mt-0.5 shrink-0 text-terracotta-dark"
          />
          <p className="text-[14px] text-ink-primary">{error}</p>
        </Card>
      ) : null}

      {!state ? (
        <Card className="text-center py-12">
          <Loader2
            size={26}
            strokeWidth={1.5}
            className="mx-auto animate-spin text-sage-dark"
          />
          <p className="mt-3 text-[13px] text-ink-secondary">Loading…</p>
        </Card>
      ) : state.configured === false ? (
        <SupabaseSetupCard />
      ) : !state.profile ? (
        <Card tone="terracotta" className="space-y-2">
          <p className="font-display text-[18px] text-ink-primary">
            No profile in the database yet.
          </p>
          <p className="text-[14px] text-ink-secondary">
            Run the seed script (<code>npx tsx scripts/seed-synthetic.ts</code>)
            once to populate one.
          </p>
        </Card>
      ) : (
        <>
          {/* Top stat row */}
          <section className="grid gap-4 grid-cols-2 lg:grid-cols-4">
            <StatCard
              icon={<Sparkles size={18} strokeWidth={1.5} />}
              value={state.sessionsRecent.length}
              label="Sessions on file"
              sublabel={`${state.sessionsRecent.filter((s) => s.source === "synthetic_seed").length} synthetic`}
            />
            <StatCard
              icon={<MessageSquare size={18} strokeWidth={1.5} />}
              value={companionNudges.length}
              label="Nudges, last 14d"
            />
            <StatCard
              icon={<FileText size={18} strokeWidth={1.5} />}
              value={companionObservations.length}
              label="Observations marked"
              sublabel="awaiting handoff"
            />
            <StatCard
              icon={<CalendarClock size={18} strokeWidth={1.5} />}
              value={upcomingAppts.length}
              label="Upcoming physio"
              sublabel={
                upcomingAppts[0]
                  ? new Date(upcomingAppts[0].appointment_at).toLocaleDateString()
                  : "none logged"
              }
            />
          </section>

          {/* Coach */}
          <section className="space-y-5">
            <PanelHeader
              icon={<Compass size={18} strokeWidth={1.5} />}
              title="Coach"
              tagline="Plans the week. Runs Sundays at 8pm UTC."
              actions={
                <Button
                  variant="secondary"
                  onClick={() => trigger("/api/agents/coach")}
                  disabled={running === "/api/agents/coach"}
                  leftIcon={
                    running === "/api/agents/coach" ? (
                      <Loader2 size={14} strokeWidth={1.5} className="animate-spin" />
                    ) : (
                      <Zap size={14} strokeWidth={1.5} />
                    )
                  }
                >
                  Run Coach now
                </Button>
              }
            />

            {!program ? (
              <Card tone="muted" className="text-[14px] text-ink-secondary">
                No active program yet. Run Coach to generate this week&rsquo;s
                plan from the Tier 1 baselines + correlations.
              </Card>
            ) : (
              <Card className="space-y-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <SectionLabel>Active program</SectionLabel>
                    <p className="mt-1 font-display text-[20px] text-ink-primary">
                      Week of {program.week_start}
                    </p>
                    <p className="text-[12px] text-ink-tertiary">
                      Generated{" "}
                      {new Date(program.generated_at).toLocaleString()}
                    </p>
                  </div>
                  <TagPill tone="sage">active</TagPill>
                </div>

                <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-7">
                  {(
                    [
                      "monday",
                      "tuesday",
                      "wednesday",
                      "thursday",
                      "friday",
                      "saturday",
                      "sunday",
                    ] as const
                  ).map((day) => {
                    const items = program.program_data[day] ?? [];
                    return (
                      <div
                        key={day}
                        className="rounded-2xl bg-base px-3 py-2.5"
                      >
                        <p className="text-[10px] uppercase tracking-[0.14em] text-ink-secondary/80">
                          {day.slice(0, 3)}
                        </p>
                        {items.length === 0 ? (
                          <p className="mt-1 text-[11px] text-ink-tertiary italic">
                            rest
                          </p>
                        ) : (
                          <ul className="mt-1 space-y-1">
                            {items.map((it, i) => (
                              <li
                                key={i}
                                className="text-[11px] text-ink-primary"
                              >
                                {it.exercise_id.replace(/_/g, " ")}
                                {it.sets && it.reps ? (
                                  <span className="block text-ink-tertiary font-mono">
                                    {it.sets}×{it.reps}
                                  </span>
                                ) : null}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div>
                  <SectionLabel>Reasoning for this week</SectionLabel>
                  <p className="mt-1.5 text-[14px] text-ink-primary/85">
                    {program.reasoning}
                  </p>
                  {previousProgram ? (
                    <details className="mt-3">
                      <summary className="cursor-pointer text-[12px] text-ink-tertiary hover:text-ink-secondary">
                        Previous week&rsquo;s reasoning
                      </summary>
                      <p className="mt-2 text-[13px] text-ink-secondary">
                        {previousProgram.reasoning}
                      </p>
                    </details>
                  ) : null}
                </div>
              </Card>
            )}
          </section>

          {/* Companion */}
          <section className="space-y-5">
            <PanelHeader
              icon={<MessageSquare size={18} strokeWidth={1.5} />}
              title="Companion"
              tagline="Observes throughout the day. Runs every 2 hours, 8am–10pm."
              actions={
                <Button
                  variant="secondary"
                  onClick={() => trigger("/api/agents/companion")}
                  disabled={running === "/api/agents/companion"}
                  leftIcon={
                    running === "/api/agents/companion" ? (
                      <Loader2 size={14} strokeWidth={1.5} className="animate-spin" />
                    ) : (
                      <Zap size={14} strokeWidth={1.5} />
                    )
                  }
                >
                  Run Companion now
                </Button>
              }
            />

            <div className="grid gap-4 lg:grid-cols-2">
              <Card className="space-y-3">
                <SectionLabel>Recent nudges (14d)</SectionLabel>
                {companionNudges.length === 0 ? (
                  <p className="text-[14px] text-ink-secondary">
                    No nudges sent. Companion deferred — within rate-limit
                    budget.
                  </p>
                ) : (
                  <ul className="space-y-3">
                    {companionNudges.slice(0, 6).map((n) => (
                      <li
                        key={n.id}
                        className="rounded-2xl bg-sage-wash px-4 py-3"
                      >
                        <p className="text-[14px] text-ink-primary">
                          {n.message_text}
                        </p>
                        <p className="mt-1 text-[11px] text-ink-tertiary">
                          {new Date(n.sent_at).toLocaleString()}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              <Card className="space-y-3">
                <SectionLabel>Observations marked for handoff</SectionLabel>
                {companionObservations.length === 0 ? (
                  <p className="text-[14px] text-ink-secondary">
                    No observations marked.
                  </p>
                ) : (
                  <ul className="space-y-3">
                    {companionObservations.slice(0, 6).map((o) => (
                      <li
                        key={o.id}
                        className="rounded-2xl border border-border bg-surface px-4 py-3 space-y-1"
                      >
                        <div className="flex items-center gap-2">
                          {o.category ? (
                            <TagPill tone="neutral">{o.category}</TagPill>
                          ) : null}
                          {o.severity === "concern" ? (
                            <TagPill tone="terracotta">concern</TagPill>
                          ) : null}
                          {o.used_in_handoff_id ? (
                            <TagPill tone="sage">consumed</TagPill>
                          ) : null}
                        </div>
                        <p className="text-[14px] text-ink-primary">
                          {o.observation_text}
                        </p>
                        <p className="text-[11px] text-ink-tertiary">
                          {new Date(o.created_at).toLocaleString()}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>
          </section>

          {/* Liaison */}
          <section className="space-y-5">
            <PanelHeader
              icon={<FileText size={18} strokeWidth={1.5} />}
              title="Liaison"
              tagline={
                upcomingAppts.length === 0
                  ? "Dormant — no appointments logged. Log one via /appointment in Telegram and Liaison wakes up."
                  : "Prepares physio handoff docs 24h before each appointment."
              }
              actions={
                upcomingAppts[0] ? (
                  <Button
                    variant="secondary"
                    onClick={() =>
                      trigger("/api/agents/liaison", {
                        appointmentId: upcomingAppts[0].id,
                      })
                    }
                    disabled={running === "/api/agents/liaison"}
                    leftIcon={
                      running === "/api/agents/liaison" ? (
                        <Loader2
                          size={14}
                          strokeWidth={1.5}
                          className="animate-spin"
                        />
                      ) : (
                        <Zap size={14} strokeWidth={1.5} />
                      )
                    }
                  >
                    Prep next appointment now
                  </Button>
                ) : null
              }
            />

            <div className="grid gap-4 lg:grid-cols-2">
              <Card className="space-y-3">
                <SectionLabel>Upcoming appointments</SectionLabel>
                {upcomingAppts.length === 0 ? (
                  <p className="text-[14px] text-ink-secondary">
                    None logged. Use{" "}
                    <code className="font-mono text-[12px] bg-base px-1.5 py-0.5 rounded">
                      /appointment YYYY-MM-DD HH:MM
                    </code>{" "}
                    in Telegram, or via the v2 app.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {upcomingAppts.map((a) => (
                      <li
                        key={a.id}
                        className="flex items-center justify-between rounded-2xl border border-border bg-surface px-4 py-3"
                      >
                        <div>
                          <p className="text-[14px] text-ink-primary">
                            {new Date(a.appointment_at).toLocaleString()}
                          </p>
                          {a.notes ? (
                            <p className="text-[12px] text-ink-tertiary">
                              {a.notes}
                            </p>
                          ) : null}
                        </div>
                        {a.liaison_doc_id ? (
                          <TagPill tone="sage">doc ready</TagPill>
                        ) : (
                          <TagPill tone="neutral">no doc yet</TagPill>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              <Card className="space-y-3">
                <SectionLabel>Past handoff documents</SectionLabel>
                {pastDocs.length === 0 ? (
                  <p className="text-[14px] text-ink-secondary">
                    No documents generated yet.
                  </p>
                ) : (
                  <ul className="space-y-3">
                    {pastDocs.slice(0, 5).map((d) => (
                      <li
                        key={d.id}
                        className="rounded-2xl bg-base px-4 py-3 space-y-1"
                      >
                        <p className="text-[12px] text-ink-tertiary">
                          {new Date(d.generated_at).toLocaleString()}
                        </p>
                        {d.content_summary?.summary ? (
                          <p className="text-[13px] text-ink-primary">
                            {d.content_summary.summary}
                          </p>
                        ) : null}
                        {d.content_summary?.questions_for_physio?.length ? (
                          <p className="text-[12px] text-ink-tertiary">
                            {d.content_summary.questions_for_physio.length}{" "}
                            question
                            {d.content_summary.questions_for_physio.length === 1
                              ? ""
                              : "s"}{" "}
                            for the physio
                          </p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>
          </section>

          {/* Tier 1 — analysis layer */}
          <section className="space-y-5">
            <PanelHeader
              icon={<Heart size={18} strokeWidth={1.5} />}
              title="Tier 1 — analysis layer"
              tagline="Personalized baselines, pain correlations, cascade predictions. Rebuilt nightly."
            />
            <div className="grid gap-4 lg:grid-cols-3">
              <Card>
                <SectionLabel>Personal baseline</SectionLabel>
                {state.baseline ? (
                  <>
                    <p className="mt-2 font-display text-[28px] font-bold text-ink-primary font-numerals">
                      {state.baseline.sample_count}
                      <span className="text-[14px] text-ink-tertiary"> sessions</span>
                    </p>
                    <p className="mt-1 text-[12px] text-ink-tertiary">
                      Computed{" "}
                      {new Date(state.baseline.computed_at).toLocaleDateString()}
                    </p>
                    {state.baseline.overall_score_mean !== null ? (
                      <p className="mt-3 text-[13px] text-ink-secondary">
                        Mean score{" "}
                        <span className="font-mono text-sage-dark">
                          {state.baseline.overall_score_mean.toFixed(1)}
                        </span>
                      </p>
                    ) : null}
                  </>
                ) : (
                  <p className="mt-2 text-[13px] text-ink-secondary">
                    Not yet computed. Trigger via{" "}
                    <code className="font-mono">
                      /api/cron/baselines
                    </code>
                    .
                  </p>
                )}
              </Card>

              <Card>
                <SectionLabel>Pain correlations</SectionLabel>
                {state.correlations.length === 0 ? (
                  <p className="mt-2 text-[13px] text-ink-secondary">
                    None surfaced yet — needs more sessions with varied pain
                    logs.
                  </p>
                ) : (
                  <ul className="mt-2 space-y-2">
                    {state.correlations.slice(0, 4).map((c, i) => (
                      <li key={i} className="text-[12px] text-ink-secondary">
                        <span className="text-ink-primary">{c.subject}</span>{" "}
                        ↔ <span className="text-ink-primary">{c.object}</span>
                        {c.lag_days > 0 ? `, lag ${c.lag_days}d` : ""}
                        <span
                          className="ml-1 font-mono"
                          style={{
                            color:
                              Math.abs(c.correlation_strength) > 0.5
                                ? "#b27460"
                                : "#8a7f76",
                          }}
                        >
                          r={c.correlation_strength.toFixed(2)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              <Card>
                <SectionLabel>Cascade prediction</SectionLabel>
                {!state.cascade ? (
                  <p className="mt-2 text-[13px] text-ink-secondary">
                    Not computed yet.
                  </p>
                ) : state.cascade.active_stages.length === 0 ? (
                  <p className="mt-2 text-[13px] text-ink-secondary">
                    No stages activated for{" "}
                    <span className="font-mono text-ink-primary">
                      {state.cascade.curve_pattern}
                    </span>
                    . Pattern within personal range.
                  </p>
                ) : (
                  <>
                    <ul className="mt-2 space-y-1.5">
                      {state.cascade.active_stages.map((s) => (
                        <li key={s.stage} className="text-[13px] text-ink-primary">
                          <span className="font-medium">
                            {s.stage.replace(/_/g, " ")}
                          </span>{" "}
                          <span className="font-mono text-ink-tertiary">
                            ({s.value} {">"} {s.threshold})
                          </span>
                        </li>
                      ))}
                    </ul>
                    {state.cascade.predicted_next.length > 0 ? (
                      <p className="mt-3 text-[12px] text-ink-secondary">
                        Watch next:{" "}
                        {state.cascade.predicted_next
                          .map((s) => s.stage.replace(/_/g, " "))
                          .join(", ")}
                      </p>
                    ) : null}
                  </>
                )}
              </Card>
            </div>
          </section>

          {/* Inter-agent message bus */}
          <section className="space-y-5">
            <PanelHeader
              icon={<Users size={18} strokeWidth={1.5} />}
              title="Inter-agent bus"
              tagline="Last 20 messages on the agent_messages table."
            />
            <Card>
              {state.messages.length === 0 ? (
                <p className="text-[14px] text-ink-secondary">
                  No messages yet.
                </p>
              ) : (
                <ul className="divide-y divide-border/60">
                  {state.messages.map((m) => (
                    <li
                      key={m.id}
                      className="flex items-center justify-between gap-3 py-2.5"
                    >
                      <div className="flex items-center gap-2 text-[13px]">
                        <span className="font-mono text-ink-secondary">
                          {m.from_agent}
                        </span>
                        <span className="text-ink-tertiary">→</span>
                        <span className="font-mono text-ink-secondary">
                          {m.to_agent}
                        </span>
                        <TagPill tone="neutral">{m.message_type}</TagPill>
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-ink-tertiary">
                        {m.status === "processed" ? (
                          <CheckCircle2
                            size={12}
                            strokeWidth={1.6}
                            className="text-sage-dark"
                          />
                        ) : (
                          <Loader2
                            size={12}
                            strokeWidth={1.6}
                            className="text-terracotta-dark"
                          />
                        )}
                        {new Date(m.created_at).toLocaleString()}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </section>

          <Card tone="muted" className="text-[12px] text-ink-tertiary">
            All three agents run on Vercel Cron. Each invocation completes in
            under 10 s, queries the shared context layer in one parallel batch,
            calls Groq with its system prompt, and acts via the tool layer
            (Supabase writes + Telegram sends + PDF generation). Inter-agent
            handoffs flow through the agent_messages table.
          </Card>
        </>
      )}
    </main>
    </AppShell>
  );
}

function SupabaseSetupCard() {
  return (
    <Card className="space-y-5">
      <div className="space-y-3">
        <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-sage-tint text-sage-dark">
          <Compass size={22} strokeWidth={1.5} />
        </div>
        <div className="space-y-1">
          <Heading level={2}>Care team is paused.</Heading>
          <p className="max-w-xl text-ink-secondary">
            The three agents need Supabase as their database and message bus.
            v2 (the scoliosis app itself — onboarding, scans, sessions, exercises)
            keeps running fine on localStorage.
          </p>
        </div>
      </div>

      <div className="space-y-3">
        <SectionLabel>Five-minute setup</SectionLabel>
        <ol className="space-y-2 text-[14px] text-ink-primary list-decimal pl-5">
          <li>
            Create a free project at{" "}
            <a
              href="https://supabase.com"
              target="_blank"
              rel="noreferrer"
              className="text-sage-dark hover:underline"
            >
              supabase.com
            </a>
            .
          </li>
          <li>
            Open the SQL editor → paste{" "}
            <code className="rounded bg-base px-1.5 py-0.5 font-mono text-[12px]">
              supabase/schema.sql
            </code>{" "}
            → run.
          </li>
          <li>
            Storage → create three private buckets:{" "}
            <code className="font-mono text-[12px]">xrays</code>,{" "}
            <code className="font-mono text-[12px]">monthly_assessments</code>,{" "}
            <code className="font-mono text-[12px]">documents</code>.
          </li>
          <li>
            Settings → API → copy the project URL +{" "}
            <code className="font-mono text-[12px]">anon</code> key +{" "}
            <code className="font-mono text-[12px]">service_role</code> key
            into <code className="font-mono text-[12px]">.env.local</code>.
          </li>
          <li>
            Restart <code className="font-mono text-[12px]">npm run dev</code>.
            This page comes alive.
          </li>
          <li>
            Optionally run{" "}
            <code className="font-mono text-[12px]">
              npx tsx scripts/seed-synthetic.ts
            </code>{" "}
            to plant 6 weeks of demo sessions so Tier 1 has signal to find on
            the first run.
          </li>
        </ol>
      </div>

      <div className="rounded-2xl bg-base px-4 py-3 text-[12px] text-ink-tertiary">
        Until that&rsquo;s done: every agent endpoint returns a clean 503
        envelope, the rest of the app works as normal, and nothing breaks.
      </div>
    </Card>
  );
}

function PanelHeader({
  icon,
  title,
  tagline,
  actions,
}: {
  icon: React.ReactNode;
  title: string;
  tagline: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-4">
      <div>
        <div className="inline-flex items-center gap-2 text-sage-dark">
          {icon}
          <Heading level={2}>{title}</Heading>
        </div>
        <p className="mt-1 text-[13px] text-ink-secondary">{tagline}</p>
      </div>
      {actions}
    </div>
  );
}
