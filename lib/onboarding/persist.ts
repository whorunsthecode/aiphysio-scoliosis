import type { OnboardingState } from "./types";

const STORAGE_KEY = "balance.profile";

function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

function toProfileRow(state: OnboardingState) {
  return {
    name: state.name,
    curve_type: state.curveType,
    severity: state.severity,
    primary_curve_apex: state.primaryCurveApex,
    primary_curve_convex_side: state.primaryLeanSide,
    secondary_curve_apex: state.secondaryCurveApex,
    secondary_curve_convex_side: state.secondaryLeanSide,
    segment_i_shift: state.segmentShifts.cervical,
    segment_ii_shift: state.segmentShifts.upper_thoracic,
    segment_iii_shift: state.segmentShifts.lower_thoracic,
    segment_iv_shift: state.segmentShifts.lumbar,
    one_sided_sport: state.lifestyle.oneSidedSport,
    one_sided_sport_frequency: state.lifestyle.oneSidedSportFrequency,
    daily_sitting_hours: state.lifestyle.dailySittingHours,
    bag_carrying_side: state.lifestyle.bagCarryingSide,
    sleep_position: state.lifestyle.sleepPosition,
  };
}

export type SaveResult =
  | { ok: true; backend: "supabase" | "localStorage"; profileId?: string }
  | { ok: false; error: string };

export async function saveProfile(state: OnboardingState): Promise<SaveResult> {
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ savedAt: new Date().toISOString(), state }),
      );
    } catch {
      // ignore quota errors; Supabase remains source of truth when available
    }
  }

  if (!isSupabaseConfigured()) {
    return { ok: true, backend: "localStorage" };
  }

  // Route saves through a server endpoint that uses the service_role key.
  // The browser anon key intentionally has no write access to profiles —
  // RLS-by-default + we only granted public-schema writes to service_role.
  try {
    const res = await fetch("/api/profile/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(state),
    });
    const body = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      profileId?: string;
      error?: string;
    };
    if (!res.ok || !body.ok) {
      return {
        ok: false,
        error: body.error ?? `Profile save returned ${res.status}`,
      };
    }
    return { ok: true, backend: "supabase", profileId: body.profileId };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return { ok: false, error: message };
  }
}

export function loadDraft(): OnboardingState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed.state ?? null;
  } catch {
    return null;
  }
}
