// Who may trigger the agent tier, checked.
//
//   npx tsx scripts/checks/auth.ts
//
// The decision functions are pure and tested directly. The route handlers
// need a Next.js request context, so for them this checks the source: every
// exported handler under app/api/agents, app/api/cron, app/api/telegram and
// app/api/care-team must call an authorisation function before doing work.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { authorizeCron } from "@/lib/agents/server-supabase";
import {
  chatAllowed,
  cronDecision,
  secretMatches,
  telegramDecision,
} from "@/lib/agents/auth";

let failures = 0;
function check(name: string, ok: boolean, detail: string) {
  if (ok) console.log(`  PASS  ${name}`);
  else {
    console.log(`  FAIL  ${name}\n        ${detail}`);
    failures++;
  }
}

console.log("\nauth decisions\n");
{
  check("cron: correct bearer passes", cronDecision("Bearer s3cret", "s3cret", true).ok, "");
  check("cron: wrong bearer is 401", JSON.stringify(cronDecision("Bearer nope", "s3cret", true)).includes("401"), "");
  check("cron: no header is rejected", !cronDecision(null, "s3cret", true).ok, "");
  check(
    "cron: a missing CRON_SECRET fails closed in production",
    !cronDecision("Bearer anything", undefined, true).ok,
    "an unset secret used to mean unguarded",
  );
  check("cron: a missing CRON_SECRET is allowed in local dev", cronDecision(null, undefined, false).ok, "");

  check("telegram: correct secret header passes", telegramDecision("tg-secret", "tg-secret", true).ok, "");
  check("telegram: wrong secret header is rejected", !telegramDecision("guess", "tg-secret", true).ok, "");
  check("telegram: no header is rejected", !telegramDecision(null, "tg-secret", true).ok, "");
  check(
    "telegram: a missing TELEGRAM_WEBHOOK_SECRET fails closed in production",
    !telegramDecision(null, undefined, true).ok,
    "",
  );

  check("chat: the linked chat is allowed", chatAllowed(12345, "12345", undefined), "");
  check("chat: falls back to TELEGRAM_CHAT_ID when no chat is linked", chatAllowed("777", null, "777"), "");
  check("chat: a stranger's chat is ignored", !chatAllowed(999, "12345", "12345"), "");
  check("chat: the linked chat wins over the environment chat", !chatAllowed("777", "12345", "777"), "");
  check("chat: nothing linked and no environment chat allows nobody", !chatAllowed(1, null, undefined), "");

  {
    const env = process.env as Record<string, string | undefined>;
    const saved = { secret: env.CRON_SECRET, node: env.NODE_ENV };
    delete env.CRON_SECRET;
    env.NODE_ENV = "production";
    const r = authorizeCron(new Request("https://example.test/api/cron/baselines"));
    env.NODE_ENV = saved.node;
    if (saved.secret !== undefined) env.CRON_SECRET = saved.secret;
    check(
      "authorizeCron fails closed in production when CRON_SECRET is unset",
      !r.ok,
      "the cron routes and the agent GETs were open to anyone on a deployment without the secret",
    );
  }

  check("secret comparison rejects different lengths", !secretMatches("abc", "abcd"), "");
  check("secret comparison rejects empty", !secretMatches("", "") && !secretMatches(null, "x"), "");
}

console.log("\nroute handlers call an authorisation function first\n");
{
  const roots = ["app/api/agents", "app/api/cron", "app/api/telegram", "app/api/care-team"];
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (name === "route.ts") files.push(p);
    }
  };
  roots.forEach(walk);

  const AUTH = /\b(authorizeCron|authorizeOwnerOrCron|telegramDecision)\s*\(/;
  for (const file of files) {
    const src = readFileSync(file, "utf8");
    const handlers = [...src.matchAll(/export async function (GET|POST|PUT|DELETE|PATCH)\s*\(([^)]*)\)\s*\{([\s\S]*?)\n\}/g)];
    for (const [, method, , body] of handlers) {
      // The handler, or the runner it delegates to, must authorise before
      // its first await on anything else.
      const runner = body.match(/return\s+(\w+)\(/)?.[1];
      const runnerBody = runner ? src.match(new RegExp(`async function ${runner}\\([^)]*\\)[^{]*\\{([\\s\\S]*?)\\n\\}`))?.[1] ?? "" : "";
      const authorised = AUTH.test(body) || (/\btrue\)/.test(body) ? false : AUTH.test(runnerBody));
      check(`${file} ${method}`, authorised, "no authorisation call before work");
    }
  }

  const webhook = readFileSync("app/api/telegram/webhook/route.ts", "utf8");
  check(
    "the webhook ignores chats other than the linked one",
    /chatAllowed\(/.test(webhook),
    "a verified request proves it came from Telegram, not from the owner",
  );
  const setup = readFileSync("app/api/telegram/setup/route.ts", "utf8");
  check(
    "webhook setup registers the secret token with Telegram",
    /secret_token/.test(setup),
    "without it Telegram never sends the header the webhook checks",
  );
}

console.log(failures === 0 ? `\nall checks passed\n` : `\n${failures} check(s) failed\n`);
process.exit(failures === 0 ? 0 : 1);
