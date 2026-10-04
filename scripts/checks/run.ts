// Runs every check in scripts/checks/, each with --gate, and fails if any
// fails. A new check is a new file here; package.json does not change, so
// branches that each add a check do not conflict with one another.
//
//   npx tsx scripts/checks/run.ts
//
// Files ending in .browser.ts need a running app and a browser, and are
// skipped; run them by hand.

import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";

const files = readdirSync("scripts/checks")
  .filter((f) => f.endsWith(".ts") && f !== "run.ts" && !f.endsWith(".browser.ts"))
  .sort();

const failed: string[] = [];
for (const f of files) {
  const r = spawnSync("npx", ["tsx", `scripts/checks/${f}`, "--gate"], { stdio: "inherit" });
  if (r.status !== 0) failed.push(f);
}

if (failed.length) {
  console.log(`\nscripts/checks failed: ${failed.join(", ")}\n`);
  process.exit(1);
}
console.log(`\nscripts/checks: ${files.length} check file(s) passed\n`);
