// Server-side profile save. The browser never writes to Supabase directly —
// it POSTs the OnboardingState here, this route validates and persists with
// the service-role key. Keeps RLS untouched and avoids exposing DB writes
// to anon. Mirrors how /api/session/save will work.

import { NextResponse } from "next/server";
import {
  SUPABASE_NOT_CONFIGURED_RESPONSE,
  isSupabaseConfigured,
} from "@/lib/agents/server-supabase";
import { getAuthedContext } from "@/lib/supabase/server";
import type { OnboardingState } from "@/lib/onboarding/types";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(SUPABASE_NOT_CONFIGURED_RESPONSE, { status: 503 });
  }

  let state: OnboardingState;
  try {
    state = (await req.json()) as OnboardingState;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  if (!state || typeof state.name !== "string") {
    return NextResponse.json(
      { ok: false, error: "Profile must include a name" },
      { status: 400 },
    );
  }

  // Runs as the signed-in user, so RLS — not this handler — is what actually
  // stops one account writing into another's profile.
  const ctx = await getAuthedContext();
  if (!ctx) {
    return NextResponse.json(
      { ok: false, error: "Not signed in" },
      { status: 401 },
    );
  }
  const { supabase, user, profileId: existingProfileId } = ctx;

  const profileRow = {
    user_id: user.id,
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
    goal_text:
      typeof (state as unknown as { goalText?: string }).goalText === "string"
        ? (state as unknown as { goalText: string }).goalText
        : null,
    updated_at: new Date().toISOString(),
  };

  // One profile per account — matched on ownership, never on name. Matching
  // by name was how two people called the same thing would have ended up
  // writing over each other.
  let profileId: string;
  if (existingProfileId) {
    const { error } = await supabase
      .from("profiles")
      .update(profileRow)
      .eq("id", existingProfileId);
    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 },
      );
    }
    profileId = existingProfileId;
  } else {
    const { data, error } = await supabase
      .from("profiles")
      .insert(profileRow)
      .select("id")
      .single();
    if (error || !data) {
      return NextResponse.json(
        { ok: false, error: error?.message ?? "Insert returned no row" },
        { status: 500 },
      );
    }
    profileId = data.id;
  }

  // Optional physio program — saved alongside if non-empty.
  if (state.physioProgram.rawText.trim()) {
    await supabase.from("physio_programs").insert({
      profile_id: profileId,
      raw_source: state.physioProgram.rawText,
      parsed_exercises: state.physioProgram.parsed?.exercises ?? [],
      lifestyle_notes: state.physioProgram.parsed?.lifestyle_notes ?? [],
    });
  }

  return NextResponse.json({ ok: true, profileId });
}
