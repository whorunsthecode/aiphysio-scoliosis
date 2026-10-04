// Which message kind a webhook reply is delivered as. Kept pure so the rule
// is tested rather than trusted at each call site.

import type { MessageKind } from "./deliver";

// A chat reply that flagged a safety concern — from the deterministic
// pre-filter or from the model calling flag_safety — is an escalation, and
// escalations are never mirrored.
export function kindForChatReply(toolsCalled: { name: string }[]): MessageKind {
  return toolsCalled.some((t) => t.name === "flag_safety") ? "safety" : "message";
}

// The /observations list carries safety flags alongside ordinary notes. If
// any row is a safety flag or a concern, the whole list is treated as one.
export function kindForObservations(
  rows: { observation_text?: string | null; severity?: string | null; category?: string | null }[],
): MessageKind {
  const flagged = rows.some(
    (r) =>
      /^SAFETY FLAG/i.test(r.observation_text ?? "") ||
      r.severity === "concern" ||
      r.category === "concern",
  );
  return flagged ? "safety" : "message";
}
