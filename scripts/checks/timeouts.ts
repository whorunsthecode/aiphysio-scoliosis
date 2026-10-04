// Every model call ends within its timeout, even if the provider never
// answers.
//
//   npx tsx scripts/checks/timeouts.ts
//
// fetch is replaced with one that hangs until aborted, so no request leaves
// the machine. Each client is called with a short timeout and must reject
// with status 504 (which lib/errors.ts turns into "took too long, nothing was
// saved") well before a 2-second guard fires. A call with no timeout would
// hang until the platform killed the function.

process.env.GROQ_API_KEY = "test-key";
process.env.GEMINI_API_KEY = "test-key";

let failures = 0;
function check(name: string, ok: boolean, detail: string) {
  if (ok) console.log(`  PASS  ${name}`);
  else {
    console.log(`  FAIL  ${name}\n        ${detail}`);
    failures++;
  }
}

// A provider that never answers. It honours AbortSignal the way real fetch
// does, so a client that passes one can cancel it.
globalThis.fetch = ((_: unknown, init?: { signal?: AbortSignal }) =>
  new Promise((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => {
      const err = new Error("The operation was aborted");
      err.name = "AbortError";
      reject(err);
    });
  })) as typeof fetch;

const GUARD_MS = 2000;
async function outcome(p: Promise<unknown>): Promise<{ kind: "timeout"; status?: number } | { kind: "hung" } | { kind: "other"; e: unknown }> {
  const guard = new Promise<"hung">((r) => setTimeout(() => r("hung"), GUARD_MS));
  try {
    const r = await Promise.race([p.then(() => "resolved" as const), guard]);
    if (r === "hung") return { kind: "hung" };
    return { kind: "other", e: "resolved unexpectedly" };
  } catch (e) {
    const status = (e as { status?: number }).status;
    return status === 504 ? { kind: "timeout", status } : { kind: "other", e };
  }
}

async function main() {
  const { chatJSON, chatWithTools, MODEL_TIMEOUT_MS } = await import("@/lib/groq");
  const { analyzeImageJSON } = await import("@/lib/gemini");

  console.log("\nmodel call timeouts\n");
  const cases: [string, () => Promise<unknown>][] = [
    ["chatJSON", () => chatJSON({ system: "s", user: "u", timeoutMs: 100 })],
    ["chatWithTools", () => chatWithTools({ messages: [{ role: "user", content: "hi" }], timeoutMs: 100 })],
    ["analyzeImageJSON", () => analyzeImageJSON({ prompt: "p", imageBase64: "AA==", mimeType: "image/png", timeoutMs: 100 })],
  ];
  let ended = 0;
  for (const [name, call] of cases) {
    const start = Date.now();
    const o = await outcome(call());
    const ms = Date.now() - start;
    if (o.kind === "timeout") ended++;
    check(
      `${name} gives up on a provider that never answers, with status 504`,
      o.kind === "timeout" && ms < GUARD_MS,
      o.kind === "hung" ? `still waiting after ${GUARD_MS}ms` : `got ${JSON.stringify(o)} after ${ms}ms`,
    );
  }
  check(
    "a default timeout exists and fits inside the 30-second route limit",
    typeof MODEL_TIMEOUT_MS === "number" && MODEL_TIMEOUT_MS > 0 && MODEL_TIMEOUT_MS < 30_000,
    `MODEL_TIMEOUT_MS = ${MODEL_TIMEOUT_MS}`,
  );
  console.log(`\n  calls that end on time when the provider hangs: ${ended}/${cases.length}`);

  console.log(failures === 0 ? `\nall checks passed\n` : `\n${failures} check(s) failed\n`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
