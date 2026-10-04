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
import { deliver } from "@/lib/messaging/deliver";
import { enforceCoachProgram, screenCoachMessage } from "@/lib/agents/coachSafety";
import type { ProfileLike } from "@/lib/exercises/profile";
import type { OnboardingState } from "@/lib/onboarding/types";

export const runtime = "nodejs";
export const maxDuration = 30;

type CoachOutput = {
  // Untrusted: shape and content are checked by enforceCoachProgram.
  program: unknown;
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

  // The model proposes; this decides. Non-library ids are dropped, every
  // side cue is rewritten from the library for the user's actual curve
  // pattern (blank when the side is unknown, and side-dependent exercises
  // withheld), and the message is screened before anyone reads it. See
  // lib/agents/coachSafety.ts.
  const enforced = enforceCoachProgram(output.program, profileLike(context.profile));
  const safeProgram = enforced.program;
  const screened = screenCoachMessage(output.telegram_message, enforced);
  if (enforced.dropped.length || screened.usedFallback) {
    console.warn("[coach] enforcement", {
      dropped: enforced.dropped,
      messageScreen: screened.reasons,
    });
  }

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

  // deliver() writes the inbox row. A second insert here used to store the
  // model's raw, unscreened message next to it.
  const sendResult = await deliver({
    supabase,
    profileId,
    agent: "coach",
    text: screened.message,
    kind: "program",
  });

  await Promise.all([
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
    delivered_in_app: sendResult.inApp,
    mirrored_to_telegram: sendResult.mirrored,
    dropped: enforced.dropped,
    message_screen: screened.reasons,
  });
}

// The Supabase profile row, in the shape the curve helpers expect.
function profileLike(row: Record<string, unknown> | null): ProfileLike | null {
  if (!row) return null;
  return {
    curveType: (row.curve_type as OnboardingState["curveType"]) ?? null,
    primaryCurveApex: (row.primary_curve_apex as OnboardingState["primaryCurveApex"]) ?? null,
    primaryLeanSide: (row.primary_curve_convex_side as OnboardingState["primaryLeanSide"]) ?? null,
    secondaryCurveApex: (row.secondary_curve_apex as OnboardingState["secondaryCurveApex"]) ?? null,
    secondaryLeanSide: (row.secondary_curve_convex_side as OnboardingState["secondaryLeanSide"]) ?? null,
    segmentShifts: {
      cervical: (row.segment_i_shift as OnboardingState["segmentShifts"]["cervical"]) ?? null,
      upper_thoracic: (row.segment_ii_shift as OnboardingState["segmentShifts"]["upper_thoracic"]) ?? null,
      lower_thoracic: (row.segment_iii_shift as OnboardingState["segmentShifts"]["lower_thoracic"]) ?? null,
      lumbar: (row.segment_iv_shift as OnboardingState["segmentShifts"]["lumbar"]) ?? null,
    },
  };
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
