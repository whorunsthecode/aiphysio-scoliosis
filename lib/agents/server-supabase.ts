// Server-side Supabase client for cron jobs and agent endpoints. Uses the
// service-role key — never import this from the browser.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null = null;

export function getServiceSupabase(): SupabaseClient {
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (server)",
    );
  }
  cached = createClient(url, key, { auth: { persistSession: false } });
  return cached;
}

// True when Supabase env vars are present. Cheap check — used by routes that
// want to return a clean 503 envelope instead of throwing.
export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}

// Standard envelope when Supabase isn't configured. Routes return this from
// their handler so the agent tier degrades gracefully in local dev.
export const SUPABASE_NOT_CONFIGURED_RESPONSE = {
  ok: false as const,
  error: "Supabase not configured (NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing)",
  configured: false as const,
};

// The agent tier is still single-tenant: TELEGRAM_CHAT_ID is one chat in the
// environment, so Coach, Companion and Liaison have exactly one person they
// can talk to. Picking "the most recently updated profile" was fine while
// that was also the only profile — but with accounts, it would happily load
// one user's pain history and send it to a different user's Telegram.
//
// So this now refuses rather than guesses. A second profile makes the agent
// tier inert until it is properly scoped per user, which is a visible outage
// instead of a silent disclosure. Fixing it properly means per-user Telegram
// linkage and cron jobs that iterate profiles — tracked, not done here.
export async function getCurrentProfileId(): Promise<string | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from("profiles")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(2);
  if (error) {
    console.warn("getCurrentProfileId failed:", error.message);
    return null;
  }
  if (!data || data.length === 0) return null;
  if (data.length > 1) {
    console.warn(
      "Agent tier is single-tenant but more than one profile exists — " +
        "refusing to run rather than risk sending one user's data to another. " +
        "Scope the agent routes per profile before re-enabling.",
    );
    return null;
  }
  return data[0].id;
}

// Cron protection: Vercel sets `CRON_SECRET` and includes it as a Bearer
// token. Production rejects calls without it. Local dev bypasses if unset.
export function authorizeCron(req: Request): { ok: true } | { ok: false; status: number } {
  const expected = process.env.CRON_SECRET;
  if (!expected) return { ok: true }; // local dev — unguarded
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${expected}`) {
    return { ok: false, status: 401 };
  }
  return { ok: true };
}
