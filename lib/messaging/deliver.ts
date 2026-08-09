// Message delivery, with the channel decided by policy rather than by whoever
// is calling.
//
// Telegram was the product's primary surface. That is not defensible for a
// health app: pain logs, weekly programmes and agent observations passed
// through a consumer messaging platform's servers, and the Liaison handoff —
// an identifiable clinical document naming the patient — was sent there as a
// file attachment. No configuration makes that private, and an ethics
// committee reviewing a clinical deployment would reject it outright.
//
// The inbox is now the record of truth. Telegram survives as an optional
// mirror because the notification habit is genuinely valuable for adherence,
// but under two hard rules:
//
//   1. Off unless the user turned it on, per profile.
//   2. Clinical documents never leave. A mirror carries a pointer — "your
//      document is ready, open the app" — never the content and never the
//      file.
//
// Rule 2 is enforced here rather than at the call sites, because a call site
// is exactly where someone will forget.

import type { SupabaseClient } from "@supabase/supabase-js";

export type MessageKind =
  | "message" // ordinary coaching text
  | "nudge" // Companion prompt
  | "program" // weekly plan summary
  | "document" // clinical handoff — never mirrored
  | "safety"; // red-flag escalation

// Kinds that must never be mirrored off-platform, whatever the caller passes.
//
// "document" is the handoff PDF: identifiable, clinical, and the single worst
// thing in this product to put on a consumer messaging platform.
//
// "safety" is a red-flag escalation. It is excluded for a different reason —
// it is the most sensitive content the app produces, and it must be read in a
// context where the escalation advice and the emergency guidance sit together
// rather than as a decontextualised chat message.
const NEVER_MIRRORED: ReadonlySet<MessageKind> = new Set(["document", "safety"]);

export type DeliverInput = {
  supabase: SupabaseClient;
  profileId: string;
  agent: string;
  text: string;
  kind?: MessageKind;
  // Storage path for an attached clinical document. Never transmitted
  // off-platform; the inbox resolves it to a short-lived signed URL on demand.
  documentPath?: string | null;
};

export type DeliverResult = {
  inApp: boolean;
  mirrored: boolean;
  mirrorSuppressedBecause?: "not_opted_in" | "kind_never_mirrored" | "no_chat_id";
};

// What a mirrored notification says when the real content cannot travel.
export function mirrorPointer(kind: MessageKind): string {
  return kind === "document"
    ? "Your physio handoff document is ready. Open Balance to view it."
    : "There's something for you in Balance. Open the app to read it.";
}

export function mayMirror(kind: MessageKind): boolean {
  return !NEVER_MIRRORED.has(kind);
}

export async function deliver(input: DeliverInput): Promise<DeliverResult> {
  const {
    supabase,
    profileId,
    agent,
    text,
    kind = "message",
    documentPath = null,
  } = input;

  // In-app first and always. If the mirror fails afterwards the user has still
  // received the message; if this fails, nothing was delivered and the caller
  // needs to know.
  const { error } = await supabase.from("notifications").insert({
    profile_id: profileId,
    sent_by_agent: agent,
    channel: "in_app",
    message_text: text,
    kind,
    document_path: documentPath,
  });
  if (error) throw new Error(`In-app delivery failed: ${error.message}`);

  if (!mayMirror(kind)) {
    return { inApp: true, mirrored: false, mirrorSuppressedBecause: "kind_never_mirrored" };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("telegram_opt_in, telegram_chat_id")
    .eq("id", profileId)
    .maybeSingle();

  if (!profile?.telegram_opt_in) {
    return { inApp: true, mirrored: false, mirrorSuppressedBecause: "not_opted_in" };
  }
  if (!profile.telegram_chat_id) {
    return { inApp: true, mirrored: false, mirrorSuppressedBecause: "no_chat_id" };
  }

  try {
    const { sendTelegramMessage } = await import("@/lib/telegram");
    await sendTelegramMessage(text, { chatId: profile.telegram_chat_id });
    return { inApp: true, mirrored: true };
  } catch {
    // A failed mirror is not a failed delivery — the message is in the inbox.
    return { inApp: true, mirrored: false };
  }
}
