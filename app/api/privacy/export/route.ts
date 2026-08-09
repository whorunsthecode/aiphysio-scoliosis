// Right of access: everything held about the signed-in user, as one JSON file.
//
// Runs as the user, not with the service-role key, so RLS is what decides what
// comes back. That is deliberate — an export built on service-role would be a
// second, unaudited path to the data, and a bug in it would leak across
// accounts. If RLS is wrong, this export is empty rather than someone else's.

import { NextResponse } from "next/server";
import { getAuthedContext } from "@/lib/supabase/server";
import { HEALTH_TABLES_CHILD_FIRST } from "@/lib/privacy/data";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET() {
  const ctx = await getAuthedContext();
  if (!ctx) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const { supabase, user, profileId } = ctx;

  const bundle: Record<string, unknown> = {
    exported_at: new Date().toISOString(),
    account: { id: user.id, email: user.email },
    note:
      "Everything Balance holds about you. Posture measurements are estimates from a camera or phone sensor, not clinical measurements — see the app's stated limits before sharing this with anyone.",
  };

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();
  bundle.profile = profile ?? null;

  if (profileId) {
    for (const table of HEALTH_TABLES_CHILD_FIRST) {
      const { data, error } = await supabase
        .from(table)
        .select("*")
        .eq("profile_id", profileId);
      // Report the failure rather than silently omitting a table — an export
      // missing a section without saying so is worse than one that errors.
      bundle[table] = error ? { error: error.message } : (data ?? []);
    }
  }

  return new NextResponse(JSON.stringify(bundle, null, 2), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "content-disposition": `attachment; filename="balance-export-${new Date().toISOString().slice(0, 10)}.json"`,
      // Never let an intermediary hold a copy of a health export.
      "cache-control": "no-store, private",
    },
  });
}
