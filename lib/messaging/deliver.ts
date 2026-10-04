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
import type { SendResult } from "@/lib/telegram";

type Send = (text: string, options: { chatId: string }) => Promise<SendResult>;

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
  // Telegram sender. Defaults to lib/telegram; injected in checks.
  send?: Send;
};

// Agents never receive the user's name — serializeContext withholds it. They
// write {name} instead, and it is substituted here, at the last moment before
// the message is stored. The name therefore never reaches a model provider
// while the message the user reads is still addressed to them.
//
// An unsubstituted placeholder is worse than an impersonal message, so a
// missing name falls back to something that reads naturally rather than
// leaving braces on screen.
export function personalise(text: string, name?: string | null): string {
  const safe = (name ?? "").trim();
  return text.replace(/\{name\}/g, safe.length > 0 ? safe : "there");
}

export type DeliverResult = {
  inApp: boolean;
  // True only when Telegram confirmed the message.
  mirrored: boolean;
  mirrorSuppressedBecause?: "not_opted_in" | "kind_never_mirrored" | "no_chat_id";
  // A mirror was attempted and Telegram rejected it or the call failed.
  mirrorFailed?: boolean;
  // For a safety escalation: the fixed pointer was sent in place of it.
  pointerSent?: boolean;
};

// Sent to Telegram in place of a safety escalation, to someone who opted in.
// It says nothing about the user, so it is not a mirror of the escalation;
// it stops the channel they are writing in from going silent at the moment
// it matters most. REVIEW: wording, October 2026.
export const SAFETY_POINTER =
  "There's an important reply for you in your Balance inbox. If this is an emergency, call 999 now, or your local emergency number if you're outside Hong Kong.";

async function defaultSend(text: string, options: { chatId: string }): Promise<SendResult> {
  const { sendTelegramMessage } = await import("@/lib/telegram");
  return sendTelegramMessage(text, options);
}

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
    send = defaultSend,
  } = input;

  const { data: profile } = await supabase
    .from("profiles")
    .select("name, telegram_opt_in, telegram_chat_id")
    .eq("id", profileId)
    .maybeSingle();

  const message = personalise(text, profile?.name as string | undefined);

  // In-app first and always. If the mirror fails afterwards the user has still
  // received the message; if this fails, nothing was delivered and the caller
  // needs to know.
  const { error } = await supabase.from("notifications").insert({
    profile_id: profileId,
    sent_by_agent: agent,
    channel: "in_app",
    message_text: message,
    kind,
    document_path: documentPath,
  });
  if (error) throw new Error(`In-app delivery failed: ${error.message}`);

  const optedIn = !!profile?.telegram_opt_in;
  const chatId = (profile?.telegram_chat_id as string | null | undefined) ?? null;

  if (!mayMirror(kind)) {
    const result: DeliverResult = { inApp: true, mirrored: false, mirrorSuppressedBecause: "kind_never_mirrored" };
    if (kind === "safety" && optedIn && chatId) {
      result.pointerSent = (await trySend(send, SAFETY_POINTER, chatId)).ok;
    }
    return result;
  }

  if (!optedIn) {
    return { inApp: true, mirrored: false, mirrorSuppressedBecause: "not_opted_in" };
  }
  if (!chatId) {
    return { inApp: true, mirrored: false, mirrorSuppressedBecause: "no_chat_id" };
  }

  // A failed mirror is not a failed delivery — the message is in the inbox —
  // but it is reported as what it is.
  const sent = await trySend(send, message, chatId);
  return sent.ok ? { inApp: true, mirrored: true } : { inApp: true, mirrored: false, mirrorFailed: true };
}

async function trySend(send: Send, text: string, chatId: string): Promise<{ ok: boolean }> {
  try {
    const r = await send(text, { chatId });
    if (!r.ok) console.warn("[deliver] Telegram send failed", r.error);
    return { ok: r.ok };
  } catch (e) {
    console.warn("[deliver] Telegram send threw", e);
    return { ok: false };
  }
}
