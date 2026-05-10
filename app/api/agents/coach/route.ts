// Coach agent — runs weekly. Plans the week ahead based on context, writes
// to weekly_programs, sends a Telegram summary, hands off to Companion.

import { NextResponse } from "next/server";
import {
  SUPABASE_NOT_CONFIGURED_RESPONSE,
  authorizeCron,
  getCurrentProfileId,
  getServiceSupabase,
  isSupabaseConfigured,
} from "@/lib/agents/server-supabase";
import {
  buildContext,
  markMessagesProcessed,
  serializeContext,
} from "@/lib/agents/context";
import { COACH_SYSTEM_PROMPT } from "@/lib/agents/prompts";
import { chatJSON } from "@/lib/groq";
import { sendTelegramMessage } from "@/lib/telegram";
import { getExerciseById } from "@/lib/exercises/library";
import {
  deriveCurvePattern,
  deriveRegionalSides,
} from "@/lib/exercises/profile";
import type { OnboardingState } from "@/lib/onboarding/types";

export const runtime = "nodejs";
export const maxDuration = 30;

type CoachOutput = {
  program: Record<
    string,
    { exercise_id: string; sets?: number; reps?: number; side_cue?: string }[]
  >;
  telegram_message: string;
  reasoning: string;
  handoff_to_companion: string;
};

export async function GET(req: Request) {
  return runCoach(req, false);
}

export async function POST(req: Request) {
  // Manual trigger from the /care-team admin button (no cron auth required).
  return runCoach(req, true);
}

async function runCoach(req: Request, manual: boolean) {
  if (!manual) {
    const auth = authorizeCron(req);
    if (!auth.ok) {
      return NextResponse.json(
        { error: "unauthorized" },
        { status: auth.status },
      );
    }
  }
  if (!isSupabaseConfigured()) {
    return NextResponse.json(SUPABASE_NOT_CONFIGURED_RESPONSE, { status: 503 });
  }

  const profileId = await getCurrentProfileId();
  if (!profileId) {
    return NextResponse.json({ ok: false, reason: "no_profile" });
  }

  const context = await buildContext(profileId, "coach");

  let output: CoachOutput;
  try {
    output = await chatJSON<CoachOutput>({
      system: COACH_SYSTEM_PROMPT,
      user: JSON.stringify(serializeContext(context)),
      temperature: 0.2,
      maxTokens: 2000,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }

  const supabase = getServiceSupabase();
  const weekStart = nextMondayUTC();

  // CRITICAL: Asymmetric side cues are clinical content. We do NOT trust the
  // LLM to derive them — wrong-side strengthening actively worsens curves.
  // Coach picks exercises + reps; we attach the right side cue from the
  // library based on the user's actual curve pattern.
  const safeProgram = enforceLibrarySideCues(output.program, context.profile);

  // Deactivate previously-active programs.
  await supabase
    .from("weekly_programs")
    .update({ is_active: false })
    .eq("profile_id", profileId)
    .eq("is_active", true);

  // Insert the new program. The unique index on (profile_id, week_start)
  // means re-running the same week overwrites via upsert semantics.
  await supabase.from("weekly_programs").upsert(
    {
      profile_id: profileId,
      week_start: weekStart,
      program_data: safeProgram,
      reasoning: output.reasoning,
      is_active: true,
      generated_at: new Date().toISOString(),
    },
    { onConflict: "profile_id,week_start" },
  );

  // Telegram + Companion handoff + message-processing in parallel.
  // Coach formats its messages with HTML tags (b, i, pre) per the prompt
  // contract so Telegram renders the schedule as a monospace grid.
  const sendResult = await sendTelegramMessage(output.telegram_message, {
    parseMode: "HTML",
  });

  await Promise.all([
    supabase.from("notifications").insert({
      profile_id: profileId,
      sent_by_agent: "coach",
      message_text: output.telegram_message,
    }),
    supabase.from("agent_messages").insert({
      profile_id: profileId,
      from_agent: "coach",
      to_agent: "companion",
      message_type: "new_program_active",
      payload: { summary: output.handoff_to_companion, week_start: weekStart },
    }),
    markMessagesProcessed(
      profileId,
      context.pendingMessages.map((m) => m.id),
    ),
  ]);

  return NextResponse.json({
    ok: true,
    week_start: weekStart,
    telegram_sent: sendResult.ok,
  });
}

// Replace the LLM's side_cue with the library-encoded asymmetric cue for
// the user's actual curve pattern. This guarantees correctness on
// asymmetric exercises (side plank, hip bridge, bird dog) regardless of
// what the LLM generated.
function enforceLibrarySideCues(
  program: CoachOutput["program"],
  profileRow: Record<string, unknown> | null,
): CoachOutput["program"] {
  if (!profileRow) return program;
  // Adapt the Supabase profile row into the OnboardingState-shaped object
  // deriveCurvePattern + deriveRegionalSides expect.
  const profile = {
    curveType: (profileRow.curve_type as OnboardingState["curveType"]) ?? null,
    primaryCurveApex: (profileRow.primary_curve_apex as OnboardingState["primaryCurveApex"]) ?? null,
    primaryLeanSide: (profileRow.primary_curve_convex_side as OnboardingState["primaryLeanSide"]) ?? null,
    secondaryCurveApex: (profileRow.secondary_curve_apex as OnboardingState["secondaryCurveApex"]) ?? null,
    secondaryLeanSide: (profileRow.secondary_curve_convex_side as OnboardingState["secondaryLeanSide"]) ?? null,
    segmentShifts: {
      cervical: (profileRow.segment_i_shift as OnboardingState["segmentShifts"]["cervical"]) ?? null,
      upper_thoracic: (profileRow.segment_ii_shift as OnboardingState["segmentShifts"]["upper_thoracic"]) ?? null,
      lower_thoracic: (profileRow.segment_iii_shift as OnboardingState["segmentShifts"]["lower_thoracic"]) ?? null,
      lumbar: (profileRow.segment_iv_shift as OnboardingState["segmentShifts"]["lumbar"]) ?? null,
    },
  } as Pick<
    OnboardingState,
    | "curveType"
    | "primaryCurveApex"
    | "primaryLeanSide"
    | "secondaryCurveApex"
    | "secondaryLeanSide"
    | "segmentShifts"
  >;

  const pattern = deriveCurvePattern(profile);
  const sides = deriveRegionalSides(profile);

  const out: CoachOutput["program"] = {};
  for (const [day, items] of Object.entries(program)) {
    out[day] = items.map((it) => {
      const lib = getExerciseById(it.exercise_id);
      // Library asymmetric_cues for this exact pattern wins. Falls back to
      // the "any" cue for symmetric exercises.
      const libCue =
        lib?.asymmetric_cues[pattern] ?? lib?.asymmetric_cues["any"] ?? null;

      // Special-case the two enforced exercises for additional safety.
      let safeCue: string | null = libCue;
      if (
        it.exercise_id === "side_plank_convex_thoracic_side_down" &&
        sides.thoracicConvex
      ) {
        safeCue = `${sides.thoracicConvex} side down`;
      }
      if (
        it.exercise_id === "hip_bridge_pelvic_press_down" &&
        sides.lumbarConvex
      ) {
        safeCue = `Press the ${sides.lumbarConvex} hip down on each lift`;
      }
      if (
        it.exercise_id === "bird_dog_asymmetric_hold" &&
        sides.thoracicConcave
      ) {
        const armSide = sides.thoracicConcave;
        const legSide = armSide === "left" ? "right" : "left";
        safeCue = `Longer hold on the ${armSide} arm + ${legSide} leg`;
      }

      return {
        ...it,
        side_cue: safeCue ?? it.side_cue ?? undefined,
      };
    });
  }
  return out;
}

function nextMondayUTC(): string {
  const now = new Date();
  const dayOfWeek = now.getUTCDay(); // 0=Sun, 1=Mon, …
  const daysUntilMon = (8 - dayOfWeek) % 7 || 7;
  const next = new Date(now);
  next.setUTCDate(now.getUTCDate() + daysUntilMon);
  next.setUTCHours(0, 0, 0, 0);
  return next.toISOString().slice(0, 10); // YYYY-MM-DD
}
