// Telegram webhook for inbound user commands.
//
// Configure once after deploy:
//   curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" \
//        -d "url=https://<your-domain>/api/telegram/webhook"
//
// Commands:
//   /status         current week's plan summary, recent activity, next appointment
//   /program        full current weekly program
//   /replan         request Coach to regenerate the week's plan
//   /appointment YYYY-MM-DD HH:MM  log an upcoming physio appointment
//   /observations   last 7 days of marked observations
//   /quiet 24       silence Companion nudges for N hours
//   /profile        view current profile (curve, goal)
//   /goal           view current goal
//   /goal <text>    set/replace the goal Coach references in plan messages
//   /help           list all commands

import { NextResponse } from "next/server";
import {
  getCurrentProfileId,
  getServiceSupabase,
  isSupabaseConfigured,
} from "@/lib/agents/server-supabase";
import { sendTelegramMessage, type TelegramUpdate } from "@/lib/telegram";
import { handleConversation } from "@/lib/agents/conversation";
import { deliver, type MessageKind } from "@/lib/messaging/deliver";
import {
  TELEGRAM_SECRET_HEADER,
  chatAllowed,
  isProductionRuntime,
  telegramDecision,
} from "@/lib/agents/auth";
import { kindForChatReply, kindForObservations } from "@/lib/messaging/replyKind";
import { logFailure, publicError } from "@/lib/errors";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: Request) {
  // 1. The request must come from Telegram: setWebhook registered a secret
  //    token, and Telegram sends it back in this header on every update.
  const auth = telegramDecision(
    req.headers.get(TELEGRAM_SECRET_HEADER),
    process.env.TELEGRAM_WEBHOOK_SECRET,
    isProductionRuntime(),
  );
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: auth.status });
  }

  const update = (await req.json().catch(() => null)) as TelegramUpdate | null;
  const text = update?.message?.text?.trim();
  const chatId = update?.message?.chat?.id;
  if (!text) return NextResponse.json({ ok: true });
  const envChat = process.env.TELEGRAM_CHAT_ID;

  if (!isSupabaseConfigured()) {
    if (chatAllowed(chatId, null, envChat)) {
      await notifyUnlinked("Supabase isn't connected on the server yet — agents are paused.");
    }
    return NextResponse.json({ ok: true });
  }

  const profileId = await getCurrentProfileId();
  if (!profileId) {
    if (chatAllowed(chatId, null, envChat)) {
      await notifyUnlinked("I don't have a profile yet — finish onboarding in the app first.");
    }
    return NextResponse.json({ ok: true });
  }

  // 2. Anyone can message a bot. Only the chat linked to this profile (or
  //    the deployment's own chat, until one is linked) may read or write its
  //    data; everyone else is ignored without a reply.
  const { data: link } = await getServiceSupabase()
    .from("profiles")
    .select("telegram_chat_id")
    .eq("id", profileId)
    .maybeSingle();
  if (!chatAllowed(chatId, (link?.telegram_chat_id as string | null) ?? null, envChat)) {
    return NextResponse.json({ ok: true });
  }

  const [cmd, ...rest] = text.split(/\s+/);

  try {
    switch (cmd.toLowerCase()) {
      case "/start":
        await reply(profileId, "Hi — I'm Balance, your scoliosis care team. Three agents watch your data and reach out when there's something worth saying.\n\nTry /status to see where you are right now.",
        );
        break;

      case "/status":
        await replyStatus(profileId);
        break;

      case "/program":
        await replyProgram(profileId);
        break;

      case "/replan":
        await requestReplan(profileId);
        break;

      case "/appointment":
        await logAppointment(profileId, rest.join(" "));
        break;

      case "/observations":
        await replyObservations(profileId);
        break;

      case "/quiet":
        await setQuietHours(profileId, parseInt(rest[0] ?? "12", 10));
        break;

      case "/profile":
        await replyProfile(profileId);
        break;

      case "/goal":
        if (rest.length === 0) {
          await replyGoal(profileId);
        } else {
          await setGoal(profileId, rest.join(" "));
        }
        break;

      case "/help":
        await reply(profileId, [
            "Commands:",
            "/status — this week at a glance",
            "/program — full weekly program",
            "/replan — ask Coach to regenerate the week",
            "/profile — your curve + goal on file",
            "/goal — view your goal",
            "/goal <text> — set/replace your goal",
            "/observations — recent observations Companion marked",
            "/appointment YYYY-MM-DD HH:MM — log a physio appointment",
            "/quiet 12 — silence Companion nudges for N hours",
          ].join("\n"),
        );
        break;

      default:
        // Anything that doesn't start with a registered slash command
        // becomes a free-text conversation. The handler routes through
        // Groq with tool-use so the bot can log pain, log exercises,
        // update goals, request replans, etc. — all from natural messages.
        await handleFreeText(profileId, text);
    }
  } catch (e) {
    logFailure("telegram/webhook", e, { command: cmd });
    await reply(profileId, publicError("save"));
  }

  return NextResponse.json({ ok: true });
}

// ─── Delivery ───────────────────────────────────────────────────────

// Every reply to a known profile goes through deliver(): in-app inbox first,
// Telegram only if this profile opted in, and never the content of a safety
// escalation. Replies used to go straight to Telegram, around the opt-in.
async function reply(profileId: string, text: string, kind: MessageKind = "message") {
  await deliver({
    supabase: getServiceSupabase(),
    profileId,
    agent: "companion",
    text,
    kind,
  });
}

// The only direct Telegram send left: a fixed notice when there is no
// profile to deliver to. It carries no user data.
async function notifyUnlinked(text: string) {
  await sendTelegramMessage(text);
}

// ─── Command handlers ───────────────────────────────────────────────

async function replyStatus(profileId: string) {
  const supabase = getServiceSupabase();
  const [program, recentSessions, upcomingAppts, recentNudges] =
    await Promise.all([
      supabase
        .from("weekly_programs")
        .select("week_start, reasoning")
        .eq("profile_id", profileId)
        .eq("is_active", true)
        .maybeSingle(),
      supabase
        .from("sessions")
        .select("started_at")
        .eq("profile_id", profileId)
        .gte(
          "started_at",
          new Date(Date.now() - 7 * 86400000).toISOString(),
        )
        .order("started_at", { ascending: false }),
      supabase
        .from("appointments")
        .select("appointment_at")
        .eq("profile_id", profileId)
        .gte("appointment_at", new Date().toISOString())
        .order("appointment_at", { ascending: true })
        .limit(1),
      supabase
        .from("notifications")
        .select("sent_at")
        .eq("profile_id", profileId)
        .eq("sent_by_agent", "companion")
        .gte(
          "sent_at",
          new Date(Date.now() - 7 * 86400000).toISOString(),
        ),
    ]);

  const lines: string[] = [];
  lines.push("This week\n");
  lines.push(`Sessions in last 7 days: ${recentSessions.data?.length ?? 0}`);
  lines.push(`Companion nudges this week: ${recentNudges.data?.length ?? 0}`);
  if (program.data) {
    lines.push(`Active program from ${program.data.week_start}`);
    lines.push(`Coach said: ${truncate(program.data.reasoning, 200)}`);
  } else {
    lines.push("No active weekly program yet — Coach runs Sunday evenings.");
  }
  if (upcomingAppts.data?.[0]) {
    const at = new Date(upcomingAppts.data[0].appointment_at);
    lines.push(`Next physio: ${at.toLocaleString()}`);
  }
  await reply(profileId, lines.join("\n"));
}

async function replyProgram(profileId: string) {
  const supabase = getServiceSupabase();
  const { data } = await supabase
    .from("weekly_programs")
    .select("week_start, program_data, reasoning")
    .eq("profile_id", profileId)
    .eq("is_active", true)
    .maybeSingle();
  if (!data) {
    await reply(profileId, "No active program yet.");
    return;
  }
  const lines: string[] = [];
  lines.push(`Week of ${data.week_start}\n`);
  const program = data.program_data as Record<string, { exercise_id: string; sets?: number; reps?: number }[]>;
  for (const day of [
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
  ]) {
    const items = program[day] ?? [];
    if (items.length === 0) {
      lines.push(`${capitalize(day)}: rest`);
    } else {
      lines.push(
        `${capitalize(day)}: ${items
          .map(
            (it) =>
              `${it.exercise_id.replace(/_/g, " ")}${it.sets ? ` ${it.sets}×${it.reps ?? "?"}` : ""}`,
          )
          .join("; ")}`,
      );
    }
  }
  lines.push(`\nCoach: ${truncate(data.reasoning, 300)}`);
  await reply(profileId, lines.join("\n"));
}

async function requestReplan(profileId: string) {
  const supabase = getServiceSupabase();
  await supabase.from("agent_messages").insert({
    profile_id: profileId,
    from_agent: "user",
    to_agent: "coach",
    message_type: "replan_request",
    payload: { reason: "user requested via Telegram" },
  });
  await reply(profileId, "Replan request queued — Coach will pick it up on its next run.",
  );
}

async function logAppointment(profileId: string, datetime: string) {
  if (!datetime) {
    await reply(profileId, "Use: /appointment YYYY-MM-DD HH:MM (24-hour)",
    );
    return;
  }
  const at = new Date(datetime.replace(" ", "T"));
  if (isNaN(at.getTime()) || at.getTime() < Date.now()) {
    await reply(profileId, "That date didn't parse, or it's in the past. Use YYYY-MM-DD HH:MM.",
    );
    return;
  }
  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from("appointments")
    .insert({
      profile_id: profileId,
      appointment_at: at.toISOString(),
    })
    .select("id")
    .single();
  if (error) {
    logFailure("telegram/appointment", error);
    await reply(profileId, publicError("save"));
    return;
  }
  await reply(profileId, `Logged. Liaison will prep your physio doc 24 hours before (${at.toLocaleString()}). Appt id: ${data.id.slice(0, 8)}.`,
  );
}

async function replyObservations(profileId: string) {
  const supabase = getServiceSupabase();
  const { data } = await supabase
    .from("agent_observations")
    .select("created_at, observation_text, severity, category, observed_by_agent")
    .eq("profile_id", profileId)
    .gte("created_at", new Date(Date.now() - 7 * 86400000).toISOString())
    .order("created_at", { ascending: false })
    .limit(10);
  if (!data || data.length === 0) {
    await reply(profileId, "No observations marked in the past week.");
    return;
  }
  const lines = data.map((o) => {
    const when = new Date(o.created_at).toLocaleDateString();
    return `${when} (${o.observed_by_agent}): ${o.observation_text}`;
  });
  await reply(profileId, `Recent observations\n\n${lines.join("\n\n")}`, kindForObservations(data));
}

async function handleFreeText(profileId: string, text: string) {
  // Log all conversations into the notifications table for the /care-team
  // view to render the chat thread.
  const supabase = getServiceSupabase();
  await supabase.from("notifications").insert({
    profile_id: profileId,
    sent_by_agent: "user",
    message_text: text,
  });

  try {
    const result = await handleConversation(profileId, text);
    // deliver() writes the inbox row. A reply that flagged a safety concern
    // (the fixed red-flag reply, or the model calling flag_safety) is
    // delivered as `safety`, so it is never mirrored to Telegram.
    await reply(profileId, result.reply, kindForChatReply(result.toolsCalled));
  } catch (e) {
    // The details go to the server log. They used to be written into the
    // user's inbox as "[error] …" and quoted back in the reply.
    logFailure("telegram/chat", e);
    await reply(profileId, publicError("chat"));
  }
}

async function replyProfile(profileId: string) {
  const supabase = getServiceSupabase();
  const { data } = await supabase
    .from("profiles")
    .select(
      "name, curve_type, primary_curve_apex, primary_curve_convex_side, secondary_curve_apex, secondary_curve_convex_side, goal_text",
    )
    .eq("id", profileId)
    .single();
  if (!data) {
    await reply(profileId, "No profile on file yet.");
    return;
  }
  const lines: string[] = [];
  lines.push(`Profile · ${data.name}`);
  lines.push("");
  lines.push(`Curve: ${data.curve_type ?? "unknown"}`);
  if (data.primary_curve_apex) {
    lines.push(
      `Primary: ${data.primary_curve_apex} · bulges ${data.primary_curve_convex_side ?? "?"}`,
    );
  }
  if (data.secondary_curve_apex) {
    lines.push(
      `Secondary: ${data.secondary_curve_apex} · bulges ${data.secondary_curve_convex_side ?? "?"}`,
    );
  }
  lines.push("");
  if (data.goal_text) {
    lines.push("Goal:");
    lines.push(data.goal_text);
  } else {
    lines.push("Goal: (not set — use /goal <text> to add one)");
  }
  await reply(profileId, lines.join("\n"));
}

async function replyGoal(profileId: string) {
  const supabase = getServiceSupabase();
  const { data } = await supabase
    .from("profiles")
    .select("goal_text")
    .eq("id", profileId)
    .single();
  if (!data?.goal_text) {
    await reply(profileId, "No goal set. Use /goal <text> to add one — e.g. /goal travel without my back being the limit",
    );
    return;
  }
  await reply(profileId, `Your goal:\n\n${data.goal_text}`);
}

async function setGoal(profileId: string, text: string) {
  const supabase = getServiceSupabase();
  const { error } = await supabase
    .from("profiles")
    .update({ goal_text: text, updated_at: new Date().toISOString() })
    .eq("id", profileId);
  if (error) {
    logFailure("telegram/goal", error);
    await reply(profileId, publicError("save"));
    return;
  }
  await reply(profileId, `Saved. Coach will reference this on the next run:\n\n${text}`,
  );
}

async function setQuietHours(profileId: string, hours: number) {
  if (!Number.isFinite(hours) || hours <= 0 || hours > 168) {
    await reply(profileId, "Try /quiet N where N is 1–168 hours.");
    return;
  }
  // Implementation: insert a `quiet_until` row into agent_messages from
  // user → companion that the Companion checks at the start of each run.
  const supabase = getServiceSupabase();
  await supabase.from("agent_messages").insert({
    profile_id: profileId,
    from_agent: "user",
    to_agent: "companion",
    message_type: "quiet_until",
    payload: {
      quiet_until: new Date(Date.now() + hours * 3600 * 1000).toISOString(),
    },
  });
  await reply(profileId, `Got it — Companion will stay quiet for ${hours}h.`);
}

function truncate(s: string, max: number) {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}
function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
