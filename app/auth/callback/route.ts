// Exchanges the magic-link code for a session cookie, then claims a profile
// for the account.
//
// The claim step matters for the single-user history already in the database:
// a profile row created before auth existed has user_id null and is otherwise
// unreachable under RLS. The first account to sign in adopts it, so existing
// sessions, scans and pain logs survive the migration instead of being
// orphaned. Once claimed, later accounts get their own profile.

import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getServiceSupabase, isSupabaseConfigured } from "@/lib/agents/server-supabase";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/";

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!code || !supabaseUrl || !anonKey) {
    return NextResponse.redirect(new URL("/sign-in?error=missing_code", url.origin));
  }

  const store = cookies();
  const supabase = createServerClient(supabaseUrl, anonKey, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (toSet) => {
        for (const { name, value, options } of toSet) {
          store.set(name, value, options);
        }
      },
    },
  });

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) {
    return NextResponse.redirect(new URL("/sign-in?error=exchange_failed", url.origin));
  }

  await claimProfile(data.user.id);

  return NextResponse.redirect(new URL(next, url.origin));
}

// Runs with the service-role key because an unclaimed profile is invisible to
// the user's own RLS policy — by definition it isn't theirs yet.
async function claimProfile(userId: string): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const admin = getServiceSupabase();

  const { data: mine } = await admin
    .from("profiles")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();
  if (mine?.id) return; // already has one

  // Adopt the oldest unclaimed profile, if any. Ordering by created_at keeps
  // this deterministic when several pre-auth rows exist.
  const { data: orphan } = await admin
    .from("profiles")
    .select("id")
    .is("user_id", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (orphan?.id) {
    await admin
      .from("profiles")
      .update({ user_id: userId, updated_at: new Date().toISOString() })
      .eq("id", orphan.id)
      .is("user_id", null); // lose the race rather than steal a claimed row
  }
  // No orphan: the profile gets created by onboarding on first save.
}
