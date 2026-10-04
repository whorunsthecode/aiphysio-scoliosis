// Browser check: the X-ray image is not sent anywhere until the user confirms.
//
//   npm run dev                      (in another terminal)
//   PW=$(npm root -g)/playwright BASE_URL=http://localhost:3000 \
//     npx tsx scripts/checks/xray-consent.browser.ts
//
// Not part of `npm run check`: it needs a running app and a browser. It
// walks onboarding to the X-ray step, loads a small test image, waits, and
// counts requests to /api/xray. The request is answered locally so no image
// leaves the machine and no API key is needed.

/* eslint-disable @typescript-eslint/no-require-imports */
const { chromium } = require(process.env.PW ?? "playwright");

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
// 1x1 PNG.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

async function main() {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? "/opt/pw-browsers/chromium" });
  const page = await browser.newPage();
  let calls = 0;
  await page.route("**/api/xray", (route: { fulfill: (r: object) => void }) => {
    calls++;
    route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ ok: false, error: "stubbed" }) });
  });

  await page.goto(`${BASE}/onboarding`, { waitUntil: "networkidle" });
  await page.fill('input[placeholder="Your name"]', "Check");
  const age = page.locator('input[placeholder="Age"]');
  if (await age.count()) await age.fill("30");
  await page.click('button:has-text("get started")');
  await page.click("text=I don't know my curve yet");
  await page.click("text=Skip — I'm not sure");
  await page.setInputFiles('input[type="file"]', { name: "spine.png", mimeType: "image/png", buffer: PNG });
  await page.waitForTimeout(2500);
  const beforeConfirm = calls;

  const confirm = page.locator('button:has-text("Send it to be read")');
  const hasConfirm = (await confirm.count()) > 0;
  if (hasConfirm) {
    await confirm.click();
    await page.waitForTimeout(1500);
  }
  const afterConfirm = calls;
  await browser.close();

  const results: [string, boolean, string][] = [
    ["no request to /api/xray after loading the file", beforeConfirm === 0, `${beforeConfirm} request(s)`],
    ["a confirm button is shown before anything is sent", hasConfirm, hasConfirm ? "shown" : "missing"],
    ["one request after the user confirms", afterConfirm === 1, `${afterConfirm} request(s) in total`],
  ];
  let failures = 0;
  console.log(`\nX-ray consent · ${BASE}\n`);
  for (const [name, ok, detail] of results) {
    if (!ok) failures++;
    console.log(`  ${ok ? "PASS" : "FAIL"}  ${name} (${detail})`);
  }
  console.log(failures ? `\n${failures} check(s) failed\n` : "\nall checks passed\n");
  process.exit(failures ? 1 : 0);
}

void main();

// A module, not a global script: other check files also declare main().
export {};
