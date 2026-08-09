// Right of erasure.
//
// Deletion has to be real: rows, and the files behind them. A radiograph in
// object storage outlives the database row that pointed at it, so emptying the
// buckets is part of the job rather than a follow-up.
//
// Requires an explicit typed confirmation. An erasure endpoint that fires on a
// stray request is a data-loss bug wearing a compliance badge.

import { NextResponse } from "next/server";
import { getAuthedContext } from "@/lib/supabase/server";
import {
  HEALTH_BUCKETS,
  HEALTH_TABLES_CHILD_FIRST,
} from "@/lib/privacy/data";

export const runtime = "nodejs";
export const maxDuration = 60;

const CONFIRMATION = "DELETE MY DATA";

export async function POST(req: Request) {
  const ctx = await getAuthedContext();
  if (!ctx) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const { supabase, user, profileId } = ctx;

  let body: { confirm?: string };
  try {
    body = (await req.json()) as { confirm?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (body.confirm !== CONFIRMATION) {
    return NextResponse.json(
      {
        error: "Confirmation required",
        expected: CONFIRMATION,
      },
      { status: 400 },
    );
  }

  if (!profileId) {
    return NextResponse.json({ ok: true, deleted: {}, note: "Nothing to delete" });
  }

  const deleted: Record<string, number | string> = {};

  // Files first. If a later step fails the user retries and the remaining rows
  // go; if rows went first and file deletion failed, the paths pointing at
  // those files would be gone and the radiographs would be unreachable
  // orphans nobody could clear.
  for (const bucket of HEALTH_BUCKETS) {
    try {
      const { data: files } = await supabase.storage
        .from(bucket)
        .list(profileId);
      const paths = (files ?? []).map((f) => `${profileId}/${f.name}`);
      if (paths.length > 0) {
        const { error } = await supabase.storage.from(bucket).remove(paths);
        deleted[`storage:${bucket}`] = error ? error.message : paths.length;
      } else {
        deleted[`storage:${bucket}`] = 0;
      }
    } catch (e) {
      deleted[`storage:${bucket}`] =
        e instanceof Error ? e.message : "failed";
    }
  }

  // Children before parents, so a partial failure never leaves rows whose
  // profile is gone — those would be unreachable under RLS and undeletable.
  for (const table of HEALTH_TABLES_CHILD_FIRST) {
    const { error, count } = await supabase
      .from(table)
      .delete({ count: "exact" })
      .eq("profile_id", profileId);
    deleted[table] = error ? error.message : (count ?? 0);
  }

  const { error: profileErr } = await supabase
    .from("profiles")
    .delete()
    .eq("id", profileId);
  deleted.profiles = profileErr ? profileErr.message : 1;

  // The auth user itself is not removed here — that needs admin privileges,
  // and leaving the account lets the user sign in to confirm the data is
  // actually gone. Account closure is a separate, explicit action.
  return NextResponse.json({
    ok: true,
    deleted,
    note: "Your health data has been deleted. Your sign-in account still exists so you can verify this; ask to close it separately.",
  });
}
