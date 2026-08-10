// Shared context layer. The single function each agent calls at the start
// of its run to assemble its view of the world. All queries fire in parallel.
//
// Agents operate on the returned UserContext object — they don't query the
// DB directly during reasoning. Keeps them stateless and testable.

import { getServiceSupabase } from "./server-supabase";
import { isCurrentMetrics } from "@/lib/pose/stats";
import { redactForThirdParty } from "@/lib/privacy/data";

export type AgentName = "coach" | "companion" | "liaison";

export type Profile = Record<string, unknown> & {
  id: string;
  name: string;
  curve_type: string | null;
  primary_curve_apex: string | null;
  primary_curve_convex_side: string | null;
  secondary_curve_apex: string | null;
  secondary_curve_convex_side: string | null;
  one_sided_sport: string | null;
  daily_sitting_hours: string | null;
  goal_text: string | null;
};

export type SessionContext = {
  id: string;
  started_at: string;
  completed_at: string | null;
  pain_check: { location: string; intensity: number; type: string }[] | null;
  exercises_completed: { exerciseId: string; setsCompleted: number }[] | null;
  final_scan: unknown;
  initial_scan: unknown;
  scan_confidence: string | null;
  source: string | null;
};

export type Baseline = Record<string, unknown> & {
  profile_id: string;
  sample_count: number;
  computed_at: string;
};

export type Correlation = {
  subject: string;
  object: string;
  lag_days: number;
  correlation_strength: number;
  confidence_low: number;
  confidence_high: number;
  evidence_count: number;
};

export type CascadePrediction = {
  curve_pattern: string;
  active_stages: { stage: string; signal: string; value: number; threshold: number; description: string }[];
  predicted_next: { stage: string; signal: string; description: string }[];
  reasoning: string;
  computed_at: string;
};

export type WeeklyProgram = {
  id: string;
  week_start: string;
  program_data: unknown;
  reasoning: string;
  is_active: boolean;
  generated_at: string;
};

export type AgentMessage = {
  id: string;
  from_agent: string;
  to_agent: string;
  message_type: string;
  payload: unknown;
  created_at: string;
};

export type AgentObservation = {
  id: string;
  observed_by_agent: string;
  observation_text: string;
  category: string | null;
  severity: string | null;
  used_in_handoff_id: string | null;
  created_at: string;
};

export type Notification = {
  id: string;
  sent_by_agent: string;
  message_text: string;
  sent_at: string;
};

export type Appointment = {
  id: string;
  appointment_at: string;
  notes: string | null;
  liaison_doc_id: string | null;
};

export type PhysioProgram = {
  id: string;
  raw_source: string;
  parsed_exercises: unknown;
  lifestyle_notes: unknown;
  clarifications: unknown;
};

export type AdherenceSnapshot = {
  sessionsLast7Days: number;
  sessionsLast30Days: number;
  activeDaysLast7: number;
  averageExercisesPerSession: number;
};

export type UserContext = {
  agent: AgentName;
  now: string;
  profile: Profile | null;
  physioProgram: PhysioProgram | null;
  baseline: Baseline | null;
  recentSessions: SessionContext[];
  recentNotifications: Notification[];
  recentObservations: AgentObservation[];
  pendingMessages: AgentMessage[];
  correlations: Correlation[];
  cascade: CascadePrediction | null;
  activeProgram: WeeklyProgram | null;
  upcomingAppointments: Appointment[];
  adherence: AdherenceSnapshot;
};

const RECENT_SESSION_DAYS = 14;
const RECENT_NOTIFICATION_DAYS = 7;
const RECENT_OBSERVATION_DAYS = 14;

export async function buildContext(
  profileId: string,
  agent: AgentName,
): Promise<UserContext> {
  const supabase = getServiceSupabase();
  const recentSessionsSince = new Date(
    Date.now() - RECENT_SESSION_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
  const notificationsSince = new Date(
    Date.now() - RECENT_NOTIFICATION_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
  const observationsSince = new Date(
    Date.now() - RECENT_OBSERVATION_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  const [
    profileResp,
    physioProgramResp,
    baselineResp,
    recentSessionsResp,
    recentNotificationsResp,
    recentObservationsResp,
    pendingMessagesResp,
    correlationsResp,
    cascadeResp,
    activeProgramResp,
    appointmentsResp,
  ] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", profileId).single(),
    supabase
      .from("physio_programs")
      .select("*")
      .eq("profile_id", profileId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("personal_baselines")
      .select("*")
      .eq("profile_id", profileId)
      .maybeSingle(),
    supabase
      .from("sessions")
      .select(
        "id, started_at, completed_at, pain_check, exercises_completed, final_scan, initial_scan, scan_confidence, source",
      )
      .eq("profile_id", profileId)
      .gte("started_at", recentSessionsSince)
      .order("started_at", { ascending: false }),
    supabase
      .from("notifications")
      .select("id, sent_by_agent, message_text, sent_at")
      .eq("profile_id", profileId)
      .gte("sent_at", notificationsSince)
      .order("sent_at", { ascending: false }),
    supabase
      .from("agent_observations")
      .select(
        "id, observed_by_agent, observation_text, category, severity, used_in_handoff_id, created_at",
      )
      .eq("profile_id", profileId)
      .gte("created_at", observationsSince)
      .order("created_at", { ascending: false }),
    supabase
      .from("agent_messages")
      .select("id, from_agent, to_agent, message_type, payload, created_at")
      .eq("profile_id", profileId)
      .eq("to_agent", agent)
      .eq("status", "pending"),
    supabase
      .from("pain_correlations")
      .select(
        "subject, object, lag_days, correlation_strength, confidence_low, confidence_high, evidence_count",
      )
      .eq("profile_id", profileId)
      .order("correlation_strength", { ascending: false }),
    supabase
      .from("cascade_predictions")
      .select("*")
      .eq("profile_id", profileId)
      .order("computed_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("weekly_programs")
      .select("*")
      .eq("profile_id", profileId)
      .eq("is_active", true)
      .order("generated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("appointments")
      .select("id, appointment_at, notes, liaison_doc_id")
      .eq("profile_id", profileId)
      .gte("appointment_at", new Date().toISOString())
      .order("appointment_at", { ascending: true }),
  ]);

  const allRecent = (recentSessionsResp.data ?? []) as SessionContext[];
  const sessionsLast7Days = allRecent.filter(
    (s) => Date.now() - new Date(s.started_at).getTime() < 7 * 24 * 60 * 60 * 1000,
  );
  const activeDaysLast7 = new Set(
    sessionsLast7Days.map((s) => new Date(s.started_at).toDateString()),
  ).size;
  const totalExercises = sessionsLast7Days.reduce(
    (a, s) => a + (s.exercises_completed?.length ?? 0),
    0,
  );
  const averageExercisesPerSession =
    sessionsLast7Days.length === 0
      ? 0
      : totalExercises / sessionsLast7Days.length;

  return {
    agent,
    now: new Date().toISOString(),
    profile: (profileResp.data as Profile | null) ?? null,
    physioProgram: (physioProgramResp.data as PhysioProgram | null) ?? null,
    baseline: (baselineResp.data as Baseline | null) ?? null,
    recentSessions: allRecent,
    recentNotifications:
      (recentNotificationsResp.data as Notification[] | null) ?? [],
    recentObservations:
      (recentObservationsResp.data as AgentObservation[] | null) ?? [],
    pendingMessages: (pendingMessagesResp.data as AgentMessage[] | null) ?? [],
    correlations: (correlationsResp.data as Correlation[] | null) ?? [],
    cascade: (cascadeResp.data as CascadePrediction | null) ?? null,
    activeProgram: (activeProgramResp.data as WeeklyProgram | null) ?? null,
    upcomingAppointments:
      (appointmentsResp.data as Appointment[] | null) ?? [],
    adherence: {
      sessionsLast7Days: sessionsLast7Days.length,
      sessionsLast30Days: allRecent.length,
      activeDaysLast7,
      averageExercisesPerSession,
    },
  };
}

// Compact JSON-friendly view for LLM input. Strips heavy Snapshot internals
// and keeps only what's useful for agent reasoning.
// Everything an agent sees. This is the single point where user data leaves
// for a model provider, so redaction happens here rather than at four call
// sites — a chokepoint that cannot be forgotten beats a convention that can.
//
// The user's name is deliberately absent. Agents address the user as {name}
// and deliver() substitutes the real one on the way to the inbox, so messages
// stay personal without the name ever reaching a third party.
export function serializeContext(ctx: UserContext): unknown {
  return redactForThirdParty({
    agent: ctx.agent,
    now: ctx.now,
    profile: ctx.profile
      ? {
          name: ctx.profile.name,
          curve_type: ctx.profile.curve_type,
          primary_curve_apex: ctx.profile.primary_curve_apex,
          primary_curve_convex_side: ctx.profile.primary_curve_convex_side,
          secondary_curve_apex: ctx.profile.secondary_curve_apex,
          secondary_curve_convex_side: ctx.profile.secondary_curve_convex_side,
          one_sided_sport: ctx.profile.one_sided_sport,
          daily_sitting_hours: ctx.profile.daily_sitting_hours,
          // The user's stated goal in their own words. Coach uses this in
          // the warm one-line "this is connected to what you actually want"
          // hook in the Telegram message.
          goal_text: ctx.profile.goal_text ?? null,
        }
      : null,
    physio_program: ctx.physioProgram
      ? {
          raw_source: ctx.physioProgram.raw_source,
          parsed_exercises: ctx.physioProgram.parsed_exercises,
        }
      : null,
    baseline: ctx.baseline,
    adherence: ctx.adherence,
    recent_sessions_summary: ctx.recentSessions.map((s) => {
      const snap = (s.final_scan ?? s.initial_scan) as
        | { measurements?: { overallScore: number } }
        | null;
      // overallScore is a weighted sum of the millimetre metrics, so it moved
      // with the aspect-ratio fix. Handing an agent a series that straddles
      // both pipelines invites it to narrate the version bump as progress.
      const score = isCurrentMetrics(snap)
        ? (snap?.measurements?.overallScore ?? null)
        : null;
      return {
        started_at: s.started_at,
        completed: s.completed_at !== null,
        score,
        scan_confidence: s.scan_confidence,
        exercises_completed:
          (s.exercises_completed ?? []).map((e) => e.exerciseId),
        pain_logged: (s.pain_check ?? []).map((p) => ({
          location: p.location,
          intensity: p.intensity,
        })),
      };
    }),
    correlations: ctx.correlations.slice(0, 5),
    cascade: ctx.cascade,
    active_program: ctx.activeProgram,
    upcoming_appointments: ctx.upcomingAppointments,
    recent_observations: ctx.recentObservations.slice(0, 10),
    recent_notifications_summary: ctx.recentNotifications.slice(0, 6).map((n) => ({
      sent_by_agent: n.sent_by_agent,
      sent_at: n.sent_at,
      message_text: n.message_text,
    })),
    pending_messages: ctx.pendingMessages.map((m) => ({
      from_agent: m.from_agent,
      message_type: m.message_type,
      payload: m.payload,
    })),
  });
}

// Mark all currently-pending messages addressed to this agent as processed.
export async function markMessagesProcessed(
  profileId: string,
  messageIds: string[],
): Promise<void> {
  if (messageIds.length === 0) return;
  const supabase = getServiceSupabase();
  await supabase
    .from("agent_messages")
    .update({ status: "processed", processed_at: new Date().toISOString() })
    .in("id", messageIds)
    .eq("profile_id", profileId);
}
