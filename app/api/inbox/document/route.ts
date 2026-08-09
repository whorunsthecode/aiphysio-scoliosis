// Short-lived signed URL for a clinical document.
//
// The handoff PDF is never transmitted anywhere. It stays in private storage
// and is reached through a URL that expires, minted only for the account that
// owns the notification pointing at it.

import { NextResponse } from "next/server";
import { getAuthedContext } from "@/lib/supabase/server";

export const runtime = "nodejs";

const EXPIRES_SECONDS = 300;

export async function POST(req: Request) {
  const ctx = await getAuthedContext();
  if (!ctx?.profileId) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const { supabase, profileId } = ctx;

  let body: { notificationId?: string };
  try {
    body = (await req.json()) as { notificationId?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.notificationId) {
    return NextResponse.json({ error: "notificationId required" }, { status: 400 });
  }

  // Resolve the path from the notification rather than trusting one supplied
  // by the caller — otherwise this endpoint would sign any path in the bucket
  // for anyone who could guess it.
  const { data: note } = await supabase
    .from("notifications")
    .select("document_path")
    .eq("id", body.notificationId)
    .eq("profile_id", profileId)
    .maybeSingle();

  if (!note?.document_path) {
    return NextResponse.json({ error: "No document" }, { status: 404 });
  }

  const { data, error } = await supabase.storage
    .from("documents")
    .createSignedUrl(note.document_path, EXPIRES_SECONDS);

  if (error || !data?.signedUrl) {
    return NextResponse.json(
      { error: error?.message ?? "Could not create link" },
      { status: 500 },
    );
  }

  return NextResponse.json(
    { url: data.signedUrl, expiresIn: EXPIRES_SECONDS },
    { headers: { "cache-control": "no-store, private" } },
  );
}
