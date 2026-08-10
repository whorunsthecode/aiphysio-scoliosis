// Property checks for the delivery policy.
//
//   npx tsx scripts/check-messaging.ts
//
// The rule that matters: a clinical document must never leave the platform,
// whatever a caller asks for. Enforced in deliver() rather than at the call
// sites, because a call site is exactly where someone forgets.

import {
  deliver,
  mayMirror,
  mirrorPointer,
  personalise,
  type MessageKind,
} from "@/lib/messaging/deliver";

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
