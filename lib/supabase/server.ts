// Server Supabase client bound to the request's cookies, so queries run as
// the signed-in user and RLS applies. This is the client every route that
// touches user data should use.
//
// Not to be confused with lib/agents/server-supabase.ts, which holds the
// service-role key and bypasses RLS. That one is for cron and agent runs
// where there is no user session — never for handling a browser request.

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient, User } from "@supabase/supabase-js";

export function isSupabaseConfiguredServer(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

export function getRouteClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }
  const store = cookies();
  return createServerClient(url, key, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (toSet) => {
        // Route handlers and server actions may write; server components
        // cannot, and throw. The middleware refreshes sessions either way,
        // so swallowing here is safe rather than lossy.
        try {
          for (const { name, value, options } of toSet) {
            store.set(name, value, options);
          }
        } catch {
          /* called from a server component — middleware handles refresh */
        }
      },
    },
  });
}

// The authenticated user, verified against the auth server rather than
// decoded from the cookie. Returns null when signed out.
export async function getSessionUser(): Promise<User | null> {
  if (!isSupabaseConfiguredServer()) return null;
  const supabase = getRouteClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data.user ?? null;
}

export type AuthedContext = { supabase: SupabaseClient; user: User; profileId: string | null };

// Resolve the signed-in user together with the profile they own. profileId is
// null before onboarding has run — callers decide whether that is an error.
export async function getAuthedContext(): Promise<AuthedContext | null> {
  if (!isSupabaseConfiguredServer()) return null;
  const supabase = getRouteClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("user_id", data.user.id)
    .maybeSingle();

  return { supabase, user: data.user, profileId: profile?.id ?? null };
}
