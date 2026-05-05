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
      program_data: output.program,
      reasoning: output.reasoning,
      is_active: true,
      generated_at: new Date().toISOString(),
    },
    { onConflict: "profile_id,week_start" },
  );

  // Telegram + Companion handoff + message-processing in parallel.
  const sendResult = await sendTelegramMessage(output.telegram_message);

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

function nextMondayUTC(): string {
  const now = new Date();
  const dayOfWeek = now.getUTCDay(); // 0=Sun, 1=Mon, …
  const daysUntilMon = (8 - dayOfWeek) % 7 || 7;
  const next = new Date(now);
  next.setUTCDate(now.getUTCDate() + daysUntilMon);
  next.setUTCHours(0, 0, 0, 0);
  return next.toISOString().slice(0, 10); // YYYY-MM-DD
}
