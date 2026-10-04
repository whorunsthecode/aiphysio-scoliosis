// Who may trigger the agent tier.
//
// Three kinds of caller:
//   cron      Vercel Cron, with CRON_SECRET as a Bearer token
//   owner     the signed-in account that owns the agent tier's profile,
//             pressing "Run now" on /care-team
//   Telegram  the webhook, which carries Telegram's secret-token header and
//             must come from the chat linked to the profile
//
// Every decision fails closed in production. A missing secret used to mean
// "unguarded", which on a deployed app means anyone.

import { timingSafeEqual } from "node:crypto";

export type AuthResult =
  | { ok: true; via: "cron" | "owner" | "telegram" | "dev" }
  | { ok: false; status: number; reason: string };

export function isProductionRuntime(): boolean {
  return process.env.NODE_ENV === "production";
}

// Constant-time comparison, so response timing does not leak the secret.
export function secretMatches(given: string | null | undefined, expected: string): boolean {
  if (!given || !expected) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function cronDecision(
  authorization: string | null | undefined,
  secret: string | undefined,
  production: boolean,
): AuthResult {
  if (secret) {
    return secretMatches(authorization, `Bearer ${secret}`)
      ? { ok: true, via: "cron" }
      : { ok: false, status: 401, reason: "bad_cron_secret" };
  }
  return production
    ? { ok: false, status: 503, reason: "cron_secret_not_set" }
    : { ok: true, via: "dev" };
}

// Telegram sends the secret_token given to setWebhook in this header.
export const TELEGRAM_SECRET_HEADER = "x-telegram-bot-api-secret-token";

export function telegramDecision(
  header: string | null | undefined,
  secret: string | undefined,
  production: boolean,
): AuthResult {
  if (secret) {
    return secretMatches(header, secret)
      ? { ok: true, via: "telegram" }
      : { ok: false, status: 401, reason: "bad_telegram_secret" };
  }
  return production
    ? { ok: false, status: 503, reason: "telegram_webhook_secret_not_set" }
    : { ok: true, via: "dev" };
}

// A verified request is from Telegram, not necessarily from the owner: anyone
// can message a bot. Only the chat linked to the profile (or, until a profile
// has its own link, the deployment's TELEGRAM_CHAT_ID) may act on it.
export function chatAllowed(
  chatId: number | string | null | undefined,
  linkedChatId: string | null | undefined,
  envChatId: string | undefined,
): boolean {
  const allowed = linkedChatId || envChatId;
  if (!allowed || chatId === null || chatId === undefined) return false;
  return String(chatId) === String(allowed);
}

// For routes a person triggers from the app: a valid cron secret, or the
// signed-in owner of the agent tier's profile.
export async function authorizeOwnerOrCron(req: Request): Promise<AuthResult> {
  const secret = process.env.CRON_SECRET;
  if (secret && secretMatches(req.headers.get("authorization"), `Bearer ${secret}`)) {
    return { ok: true, via: "cron" };
  }

  const { isSupabaseConfiguredServer, getRouteClient } = await import("@/lib/supabase/server");
  if (!isSupabaseConfiguredServer()) {
    return isProductionRuntime()
      ? { ok: false, status: 503, reason: "auth_not_configured" }
      : { ok: true, via: "dev" };
  }

  const {
    data: { user },
  } = await getRouteClient().auth.getUser();
  if (!user) return { ok: false, status: 401, reason: "not_signed_in" };

  const { getCurrentProfileId, getServiceSupabase } = await import("./server-supabase");
  const profileId = await getCurrentProfileId();
  if (!profileId) return { ok: false, status: 403, reason: "no_agent_profile" };
  const { data } = await getServiceSupabase()
    .from("profiles")
    .select("user_id")
    .eq("id", profileId)
    .maybeSingle();
  if (!data || data.user_id !== user.id) return { ok: false, status: 403, reason: "not_owner" };
  return { ok: true, via: "owner" };
}
