// Property checks for the delivery policy.
//
//   npx tsx scripts/check-messaging.ts
//
// The rule that matters: a clinical document must never leave the platform,
// whatever a caller asks for. Enforced in deliver() rather than at the call
// sites, because a call site is exactly where someone forgets.

import { readFileSync } from "node:fs";
import {
  SAFETY_POINTER,
  deliver,
  mayMirror,
  mirrorPointer,
  personalise,
  type MessageKind,
} from "@/lib/messaging/deliver";
import { kindForChatReply, kindForObservations } from "@/lib/messaging/replyKind";

let failures = 0;
function check(name: string, ok: boolean, detail: string) {
  if (ok) console.log(`  PASS  ${name}`);
  else {
    console.log(`  FAIL  ${name}\n        ${detail}`);
    failures++;
  }
}

// Minimal Supabase stand-in recording what was written and returning a
// configurable profile.
function fakeSupabase(profile: Record<string, unknown> | null) {
  const inserts: Record<string, unknown>[] = [];
  const client = {
    inserts,
    from(table: string) {
      return {
        insert: async (row: Record<string, unknown>) => {
          inserts.push({ table, ...row });
          return { error: null };
        },
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: profile }),
          }),
        }),
      };
    },
  };
  return client as unknown as Parameters<typeof deliver>[0]["supabase"] & {
    inserts: Record<string, unknown>[];
  };
}

console.log("\nname handling\n");
{
  check(
    "a placeholder becomes the real name at delivery",
    personalise("Morning, {name}.", "Karmen") === "Morning, Karmen.",
    "the user should still be addressed by name",
  );
  check(
    "a missing name reads naturally rather than leaving braces on screen",
    personalise("Morning, {name}.", null) === "Morning, there.",
    `got "${personalise("Morning, {name}.", null)}"`,
  );
  check(
    "a blank name is treated as missing",
    personalise("Hi {name}", "   ") === "Hi there",
    "whitespace is not a name",
  );
  check(
    "every occurrence is replaced, not just the first",
    personalise("{name}, {name}", "A") === "A, A",
    "a second placeholder would otherwise reach the user raw",
  );
}

console.log("\ndelivery policy\n");

{
  check(
    "clinical documents are never mirrorable",
    !mayMirror("document"),
    "the handoff PDF names the patient — it must not reach a consumer platform",
  );
  check(
    "safety escalations are never mirrorable",
    !mayMirror("safety"),
    "red-flag advice must be read alongside its emergency guidance, not as a chat message",
  );
  check(
    "ordinary coaching content may be mirrored",
    mayMirror("message") && mayMirror("nudge") && mayMirror("program"),
    "blocking everything would remove the adherence benefit entirely",
  );
  check(
    "the document pointer carries no clinical content",
    !/pain|curve|cobb|scoliosis|angle/i.test(mirrorPointer("document")),
    `pointer leaked content: ${mirrorPointer("document")}`,
  );
}

async function main() {
console.log("\nenforcement\n");
{
  // Opted in, with a chat id — the most permissive configuration there is.
  const optedIn = { telegram_opt_in: true, telegram_chat_id: "12345" };

  const sb = fakeSupabase(optedIn);
  const doc = await deliver({
    supabase: sb,
    profileId: "p1",
    agent: "liaison",
    text: "Your handoff document for Tuesday's appointment is ready.",
    kind: "document",
    documentPath: "documents/p1/handoff.pdf",
  });
  check(
    "a document is not mirrored even when the user opted in",
    doc.inApp && !doc.mirrored && doc.mirrorSuppressedBecause === "kind_never_mirrored",
    `got ${JSON.stringify(doc)} — opt-in must not override the document rule`,
  );
  check(
    "the document path is recorded in-app, not transmitted",
    sb.inserts.some((i) => i.document_path === "documents/p1/handoff.pdf"),
    "the inbox needs the path to resolve a signed URL on demand",
  );

  const sb2 = fakeSupabase({ telegram_opt_in: false, telegram_chat_id: "12345" });
  const notOptedIn = await deliver({
    supabase: sb2,
    profileId: "p1",
    agent: "companion",
    text: "How's the back today?",
    kind: "nudge",
  });
  check(
    "mirroring is off unless the user turned it on",
    !notOptedIn.mirrored && notOptedIn.mirrorSuppressedBecause === "not_opted_in",
    `got ${JSON.stringify(notOptedIn)} — a chat id alone must not be consent`,
  );
  check(
    "the message still reaches the inbox when the mirror is off",
    notOptedIn.inApp && sb2.inserts.length === 1,
    "suppressing the mirror must not suppress delivery",
  );

  const sb3 = fakeSupabase({ telegram_opt_in: true, telegram_chat_id: null });
  const noChat = await deliver({
    supabase: sb3,
    profileId: "p1",
    agent: "coach",
    text: "This week's plan is ready.",
    kind: "program",
  });
  check(
    "opt-in without a chat id does not fall back to a shared environment chat",
    !noChat.mirrored && noChat.mirrorSuppressedBecause === "no_chat_id",
    `got ${JSON.stringify(noChat)} — falling back to TELEGRAM_CHAT_ID would send one user's data to another's chat`,
  );

  const sb4 = fakeSupabase(null);
  const noProfile = await deliver({
    supabase: sb4,
    profileId: "p1",
    agent: "coach",
    text: "Plan ready.",
    kind: "program",
  });
  check(
    "a missing profile suppresses the mirror rather than erroring open",
    noProfile.inApp && !noProfile.mirrored,
    `got ${JSON.stringify(noProfile)}`,
  );

  const sb5 = fakeSupabase({
    name: "Karmen",
    telegram_opt_in: false,
    telegram_chat_id: null,
  });
  await deliver({
    supabase: sb5,
    profileId: "p1",
    agent: "coach",
    text: "Nice work this week, {name}.",
    kind: "program",
  });
  check(
    "the placeholder is substituted before the message is stored",
    sb5.inserts.some((i) => i.message_text === "Nice work this week, Karmen."),
    `got ${JSON.stringify(sb5.inserts.map((i) => i.message_text))}`,
  );

  // The mirror's real outcome is reported. sendTelegramMessage returns
  // { ok: false } rather than throwing, and that used to read as success.
  const sent: string[] = [];
  const failingSend = async (text: string) => {
    sent.push(text);
    return { ok: false as const, error: "Telegram 502: Bad Gateway" };
  };
  const failed = await deliver({
    supabase: fakeSupabase(optedIn),
    profileId: "p1",
    agent: "companion",
    text: "How's the back today?",
    kind: "nudge",
    send: failingSend,
  });
  check(
    "a Telegram API failure is reported as not mirrored",
    failed.inApp && !failed.mirrored && failed.mirrorFailed === true,
    `got ${JSON.stringify(failed)}`,
  );
  const thrown = await deliver({
    supabase: fakeSupabase(optedIn),
    profileId: "p1",
    agent: "companion",
    text: "How's the back today?",
    kind: "nudge",
    send: async () => {
      throw new Error("network down");
    },
  });
  check(
    "a thrown send is reported as not mirrored",
    thrown.inApp && !thrown.mirrored && thrown.mirrorFailed === true,
    `got ${JSON.stringify(thrown)}`,
  );
  const okSend = await deliver({
    supabase: fakeSupabase(optedIn),
    profileId: "p1",
    agent: "companion",
    text: "How's the back today?",
    kind: "nudge",
    send: async () => ({ ok: true as const, messageId: 1 }),
  });
  check("a successful send is reported as mirrored", okSend.mirrored && !okSend.mirrorFailed, JSON.stringify(okSend));

  // A safety escalation's content never leaves the app. Someone who wrote
  // to the bot about chest pain still gets a fixed pointer in Telegram, so
  // the channel they are using is not silent.
  const safetySent: string[] = [];
  const sbSafety = fakeSupabase(optedIn);
  const safety = await deliver({
    supabase: sbSafety,
    profileId: "p1",
    agent: "companion",
    text: "Chest pain needs to be checked straight away. Call 999 now.",
    kind: "safety",
    send: async (text: string) => {
      safetySent.push(text);
      return { ok: true as const, messageId: 2 };
    },
  });
  check(
    "a safety escalation is not mirrored, even when opted in",
    !safety.mirrored && safety.mirrorSuppressedBecause === "kind_never_mirrored",
    JSON.stringify(safety),
  );
  check(
    "…only the fixed pointer goes to Telegram",
    safetySent.length === 1 && safetySent[0] === SAFETY_POINTER && safety.pointerSent === true,
    JSON.stringify(safetySent),
  );
  check(
    "…and the pointer carries nothing about the user",
    !/\b(pain|chest|curve|bladder|numb|numbness|scoliosis|kill|harm|suicid\w*)\b/i.test(SAFETY_POINTER),
    SAFETY_POINTER,
  );
  check(
    "…while the inbox keeps the full reply",
    sbSafety.inserts.some((i) => i.kind === "safety" && /Chest pain/.test(String(i.message_text))),
    JSON.stringify(sbSafety.inserts),
  );
  const notOptedSafety: string[] = [];
  await deliver({
    supabase: fakeSupabase({ telegram_opt_in: false, telegram_chat_id: "12345" }),
    profileId: "p1",
    agent: "companion",
    text: "Chest pain needs to be checked straight away.",
    kind: "safety",
    send: async (text: string) => {
      notOptedSafety.push(text);
      return { ok: true as const, messageId: 3 };
    },
  });
  check("no pointer is sent to a profile that has not opted in", notOptedSafety.length === 0, JSON.stringify(notOptedSafety));

  // Which kind each webhook reply is delivered as.
  check(
    "a chat reply that flagged a safety concern is delivered as a safety escalation",
    kindForChatReply([{ name: "log_pain" }, { name: "flag_safety" }]) === "safety" &&
      kindForChatReply([{ name: "log_pain" }]) === "message",
    "the fixed red-flag reply must never be mirrored",
  );
  check(
    "an observations list containing a safety flag is delivered as a safety escalation",
    kindForObservations([{ observation_text: "SAFETY FLAG (prefilter:chest_pain): chest pain" }]) === "safety" &&
      kindForObservations([{ observation_text: "Adherence dipped midweek", severity: "info" }]) === "message" &&
      kindForObservations([{ observation_text: "x", severity: "concern" }]) === "safety",
    "SAFETY FLAG rows were being sent straight to Telegram",
  );

  // The webhook may only talk to Telegram directly when there is no profile
  // to deliver to. Everything else goes through deliver().
  const webhook = readFileSync("app/api/telegram/webhook/route.ts", "utf8");
  const direct = webhook.split("\n").filter((l) => /sendTelegramMessage\(/.test(l));
  check(
    "the webhook sends nothing to Telegram except through deliver() or the no-profile notice",
    direct.length === 1 && /function notifyUnlinked|notifyUnlinked/.test(webhook),
    `${direct.length} direct call(s):\n${direct.join("\n")}`,
  );

  check(
    "every message kind is either mirrorable or explicitly not",
    (["message", "nudge", "program", "document", "safety"] as MessageKind[]).every(
      (k) => typeof mayMirror(k) === "boolean",
    ),
    "a new kind must make an explicit choice",
  );
}

}

main().then(() => {
  console.log(
    failures === 0 ? `\nall checks passed\n` : `\n${failures} check(s) failed\n`,
  );
  process.exit(failures === 0 ? 0 : 1);
});
