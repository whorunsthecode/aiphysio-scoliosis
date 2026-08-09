// Companion agent — runs every 2 hours during waking hours. Decides between
// SEND, MARK, REPLAN_REQUEST, or DEFER. Enforces rate limits before calling
// the LLM (max 2 nudges/day, no repeats within 48h, and any active /quiet
// window from Telegram).

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
import { COMPANION_SYSTEM_PROMPT } from "@/lib/agents/prompts";
import { chatJSON } from "@/lib/groq";
import { deliver } from "@/lib/messaging/deliver";

export const runtime = "nodejs";
export const maxDuration = 30;

type CompanionDecision = {
  action: "SEND" | "MARK" | "REPLAN_REQUEST" | "DEFER";
  telegram_message: string | null;
  observation_text: string | null;
  observation_category:
    | "pain_pattern"
    | "adherence"
    | "lifestyle"
    | "concern"
    | null;
  observation_severity: "info" | "note" | "concern" | null;
  replan_reason: string | null;
  defer_reason: string | null;
};

const MAX_NUDGES_PER_24H = 2;

export async function GET(req: Request) {
  return runCompanion(req, false);
}

export async function POST(req: Request) {
  // Event triggers from the v2 app: ?trigger=session_complete or =high_pain.
  return runCompanion(req, true);
}

async function runCompanion(req: Request, manual: boolean) {
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

  const supabase = getServiceSupabase();

  // Pre-LLM rate-limit gate. Saves a Groq call when we already know we'd defer.
  const last24h = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { count: nudgesLast24 } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("profile_id", profileId)
    .eq("sent_by_agent", "companion")
    .gte("sent_at", last24h);

  if ((nudgesLast24 ?? 0) >= MAX_NUDGES_PER_24H) {
    return NextResponse.json({
      ok: true,
      action: "DEFER",
      reason: "rate_limit_24h",
    });
  }

  // Quiet-hours check from any pending /quiet messages.
  const { data: pendingQuiet } = await supabase
    .from("agent_messages")
    .select("id, payload, created_at")
    .eq("profile_id", profileId)
    .eq("to_agent", "companion")
    .eq("message_type", "quiet_until")
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1);

  if (pendingQuiet && pendingQuiet[0]) {
    const until = (pendingQuiet[0].payload as { quiet_until?: string })?.quiet_until;
    if (until && new Date(until).getTime() > Date.now()) {
      return NextResponse.json({
        ok: true,
        action: "DEFER",
        reason: "quiet_hours_active",
        until,
      });
    }
  }

  const context = await buildContext(profileId, "companion");

  let decision: CompanionDecision;
  try {
    decision = await chatJSON<CompanionDecision>({
      system: COMPANION_SYSTEM_PROMPT,
      user: JSON.stringify(serializeContext(context)),
      temperature: 0.4,
      maxTokens: 800,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }

  switch (decision.action) {
    case "SEND": {
      if (!decision.telegram_message) break;
      const sent = await deliver({
        supabase,
        profileId,
        agent: "companion",
        text: decision.telegram_message,
        kind: "nudge",
      });
      // deliver() writes the notification row itself — inserting again here
      // would double-count nudges against the 2-per-24h cap.
      void sent;
      break;
    }
    case "MARK": {
      if (!decision.observation_text) break;
      await supabase.from("agent_observations").insert({
        profile_id: profileId,
        observed_by_agent: "companion",
        observation_text: decision.observation_text,
        category: decision.observation_category,
        severity: decision.observation_severity ?? "info",
      });
      break;
    }
    case "REPLAN_REQUEST": {
      await supabase.from("agent_messages").insert({
        profile_id: profileId,
        from_agent: "companion",
        to_agent: "coach",
        message_type: "replan_request",
        payload: { reason: decision.replan_reason ?? "Companion-initiated" },
      });
      break;
    }
    case "DEFER":
    default:
      break;
  }

  await markMessagesProcessed(
    profileId,
    context.pendingMessages.map((m) => m.id),
  );

  return NextResponse.json({
    ok: true,
    action: decision.action,
    reason: decision.defer_reason ?? null,
  });
}
