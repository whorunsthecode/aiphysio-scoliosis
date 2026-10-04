// One-shot Telegram bot setup. Hit this once after deploy to:
//   1. Register the slash-command menu (setMyCommands)
//   2. Wire Telegram's webhook at /api/telegram/webhook (setWebhook)
//
// Idempotent — safe to re-run. Reads TELEGRAM_BOT_TOKEN from env so the
// token never leaves the server. The deployed URL is auto-detected from
// the request's host header.

import { NextResponse } from "next/server";
import { authorizeOwnerOrCron, isProductionRuntime } from "@/lib/agents/auth";

export const runtime = "nodejs";
export const maxDuration = 30;

const COMMANDS: { command: string; description: string }[] = [
  { command: "status", description: "This week at a glance" },
  { command: "program", description: "Full weekly program" },
  { command: "replan", description: "Ask Coach to regenerate the week" },
  { command: "profile", description: "Your curve + goal on file" },
  { command: "goal", description: "View or set your goal" },
  { command: "observations", description: "Recent observations marked" },
  {
    command: "appointment",
    description: "Log a physio appointment (YYYY-MM-DD HH:MM)",
  },
  { command: "quiet", description: "Silence Companion nudges for N hours" },
  { command: "help", description: "List commands" },
];

export async function GET(req: Request) {
  // Re-pointing the bot's webhook is an admin action.
  const auth = await authorizeOwnerOrCron(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: auth.status });
  }

  // The webhook rejects updates without this secret in production, so
  // registering without it would silently break the bot.
  const secretToken = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secretToken && isProductionRuntime()) {
    return NextResponse.json(
      { ok: false, error: "Set TELEGRAM_WEBHOOK_SECRET (1-256 characters: A-Z, a-z, 0-9, _ and -) before registering the webhook." },
      { status: 503 },
    );
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    return NextResponse.json(
      { ok: false, error: "TELEGRAM_BOT_TOKEN not set" },
      { status: 503 },
    );
  }

  // Auto-detect host so this works on any Vercel preview/production URL.
  const url = new URL(req.url);
  const baseUrl = `${url.protocol}//${url.host}`;
  const webhookUrl = `${baseUrl}/api/telegram/webhook`;

  const [commandsRes, webhookRes] = await Promise.all([
    fetch(`https://api.telegram.org/bot${token}/setMyCommands`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ commands: COMMANDS }),
    }),
    fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: webhookUrl,
        // Telegram echoes this back in X-Telegram-Bot-Api-Secret-Token on
        // every update; the webhook rejects requests without it.
        ...(secretToken ? { secret_token: secretToken } : {}),
        // Drop any messages queued before the webhook was set so we don't
        // re-process old test messages.
        drop_pending_updates: true,
      }),
    }),
  ]);

  const commandsBody = await commandsRes.json().catch(() => ({}));
  const webhookBody = await webhookRes.json().catch(() => ({}));

  return NextResponse.json({
    ok: commandsRes.ok && webhookRes.ok,
    setMyCommands: { status: commandsRes.status, body: commandsBody },
    setWebhook: { status: webhookRes.status, body: webhookBody, url: webhookUrl },
    next: "Open the bot in Telegram. Type / — the command menu should appear. Send /help.",
  });
}
