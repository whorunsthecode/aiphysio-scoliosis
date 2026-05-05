// Session persistence: always to localStorage (history list), additionally
// to Supabase when configured. Used by the orchestrator on completion.

import type { SessionState } from "./types";

const HISTORY_KEY = "balance.sessions";

function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

function toRow(state: SessionState) {
  return {
    started_at: new Date(state.startedAt).toISOString(),
    completed_at: state.completedAt
      ? new Date(state.completedAt).toISOString()
      : null,
    pain_check: state.pain,
    initial_scan: state.initialScan,
    exercises_completed: state.exerciseSummaries,
    final_scan: state.finalScan,
    notes: null,
  };
}

export type SaveSessionResult =
  | { ok: true; backend: "supabase" | "localStorage"; sessionId?: string }
  | { ok: false; error: string };

export async function saveSession(state: SessionState): Promise<SaveSessionResult> {
  // Always store locally so history works without Supabase.
  if (typeof window !== "undefined") {
    try {
      const raw = window.localStorage.getItem(HISTORY_KEY);
      const list: SessionState[] = raw ? JSON.parse(raw) : [];
      list.push(state);
      // Cap at last 50 sessions in localStorage.
      const trimmed = list.slice(-50);
      window.localStorage.setItem(HISTORY_KEY, JSON.stringify(trimmed));
    } catch {
      // ignore quota errors
    }
  }

  if (!isSupabaseConfigured()) {
    return { ok: true, backend: "localStorage" };
  }

  try {
    const { getBrowserSupabase } = await import("@/lib/db");
    const supabase = getBrowserSupabase();
    const { data, error } = await supabase
      .from("sessions")
      .insert(toRow(state))
      .select("id")
      .single();
    if (error) throw error;
    return { ok: true, backend: "supabase", sessionId: data?.id };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Unknown error",
    };
  }
}

export function loadSessionHistory(): SessionState[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY);
    return raw ? (JSON.parse(raw) as SessionState[]) : [];
  } catch {
    return [];
  }
}
