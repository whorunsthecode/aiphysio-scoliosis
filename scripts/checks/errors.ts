// User-facing failures are plain sentences; details go to the server log.
//
//   npx tsx scripts/checks/errors.ts
//
// Two parts. The message table: every failure kind and status maps to a
// sentence that names no provider, status code or internal detail. The
// source scan: the routes, pages and bot handlers that used to put raw
// error text in front of a person no longer do.

import { readFileSync } from "node:fs";
import { NETWORK_ERROR, publicError, type FailureKind } from "@/lib/errors";

let failures = 0;
function check(name: string, ok: boolean, detail: string) {
  if (ok) console.log(`  PASS  ${name}`);
  else {
    console.log(`  FAIL  ${name}\n        ${detail}`);
    failures++;
  }
}

console.log("\nmessage table\n");
{
  const RAW = /groq|gemini|google|api\b|supabase|\{|\}|undefined|null|error:|\b\d{3}\b|stack|exception/i;
  const kinds: FailureKind[] = ["xray", "parse", "agent", "chat", "save"];
  const statuses = [undefined, 400, 401, 403, 413, 415, 429, 500, 502, 503, 504];
  for (const k of kinds) {
    const bad = statuses
      .map((s) => [s, publicError(k, s)] as const)
      .filter(([, m]) => RAW.test(m) || m.trim().length < 10 || !/[.?]$/.test(m.trim()));
    check(
      `${k}: every status reads as a plain sentence`,
      bad.length === 0,
      bad.map(([s, m]) => `${s}: "${m}"`).join("; "),
    );
  }
  check("the network message is plain", !RAW.test(NETWORK_ERROR), NETWORK_ERROR);
}

console.log("\nno raw error text reaches a person\n");
{
  const RAW_SITES: [string, RegExp[]][] = [
    ["app/api/xray/route.ts", [/error:\s*(e instanceof Error \?|e\.message|`Unsupported)/]],
    ["app/api/parse-program/route.ts", [/error:\s*(e instanceof Error \?|e\.message)/]],
    ["app/api/agents/coach/route.ts", [/error:\s*(e instanceof Error \?|e\.message|String\(e\))/]],
    ["app/api/agents/companion/route.ts", [/error:\s*(e instanceof Error \?|e\.message|String\(e\))/]],
    ["app/api/agents/liaison/route.ts", [/error:\s*(e instanceof Error \?|e\.message|String\(e\))/]],
    [
      "app/api/telegram/webhook/route.ts",
      [/\$\{msg\}/, /\$\{error\.message\}/, /\$\{e\.message\}/, /message_text:\s*`\[error\]/],
    ],
    ["app/care-team/page.tsx", [/setError\(e instanceof Error \? e\.message/, /setError\(`\$\{path\}/]],
    ["components/onboarding/steps/XrayStep.tsx", [/parseError:\s*e instanceof Error \? e\.message/]],
    ["components/onboarding/steps/ProgramStep.tsx", [/parseError:\s*e instanceof Error \? e\.message/]],
  ];
  let total = 0;
  for (const [file, patterns] of RAW_SITES) {
    const lines = readFileSync(file, "utf8").split("\n");
    const hits = lines
      .map((l, i) => [i + 1, l] as const)
      .filter(([, l]) => patterns.some((p) => p.test(l)));
    total += hits.length;
    check(`${file}`, hits.length === 0, hits.map(([n, l]) => `:${n} ${l.trim()}`).join("\n        "));
  }
  console.log(`\n  raw-error sites remaining: ${total}`);
}

console.log(failures === 0 ? `\nall checks passed\n` : `\n${failures} check(s) failed\n`);
process.exit(failures === 0 ? 0 : 1);
