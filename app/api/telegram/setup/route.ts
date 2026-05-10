// One-shot Telegram bot setup. Hit this once after deploy to:
//   1. Register the slash-command menu (setMyCommands)
//   2. Wire Telegram's webhook at /api/telegram/webhook (setWebhook)
//
// Idempotent — safe to re-run. Reads TELEGRAM_BOT_TOKEN from env so the
// token never leaves the server. The deployed URL is auto-detected from
// the request's host header.

import { NextResponse } from "next/server";

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
