// Property checks for the privacy controls.
//
//   npx tsx scripts/check-privacy.ts
//
// These exist because privacy defects are silent. Nothing breaks when a
// radiograph is written to localStorage or a name reaches a model provider —
// it works fine, and keeps working, until it matters.

import {
  HEALTH_BUCKETS,
  HEALTH_TABLES_CHILD_FIRST,
  LOCAL_HEALTH_KEYS,
  containsIdentifiers,
  redactForThirdParty,
  sanitiseForLocalStorage,
} from "@/lib/privacy/data";
import { initialOnboardingState } from "@/lib/onboarding/initialState";
import type { OnboardingState } from "@/lib/onboarding/types";

let failures = 0;
function check(name: string, ok: boolean, detail: string) {
  if (ok) console.log(`  PASS  ${name}`);
  else {
    console.log(`  FAIL  ${name}\n        ${detail}`);
    failures++;
  }
}

console.log("\nlocal storage hygiene\n");
{
  const withXray = {
    ...initialOnboardingState,
    name: "Test",
    safetyScreen: { bladder_bowel_change: false, night_pain: true },
    xray: {
      ...initialOnboardingState.xray,
      fileName: "spine.jpg",
      dataUrl: "data:image/jpeg;base64,AAAAAAAAAAAAAAAA",
    },
  } as unknown as OnboardingState;

  const safe = sanitiseForLocalStorage(withXray);

  check(
    "the X-ray image is stripped before local persistence",
    safe.xray.dataUrl === null,
    "a base64 radiograph in localStorage is readable by any script on the origin and survives sign-out",
  );
  check(
    "the filename survives, so the UI can still say which file was read",
    safe.xray.fileName === "spine.jpg",
    "stripping too much makes the feature unusable",
  );
  check(
    "red-flag answers are not persisted locally",
    safe.safetyScreen === undefined,
    "screening answers are the most sensitive thing the user tells this app",
  );
  check(
    "no image data survives anywhere in the serialised draft",
    !JSON.stringify(safe).includes("base64"),
    `found image data in ${JSON.stringify(safe).slice(0, 120)}`,
  );
  check(
    "clinical fields the app actually needs are kept",
    safe.name === "Test" && "curveType" in safe,
    "sanitising must not empty the draft",
  );
  check(
    "every key the app writes locally is listed for sign-out clearing",
    LOCAL_HEALTH_KEYS.includes("balance.profile") &&
      LOCAL_HEALTH_KEYS.includes("balance.sessions"),
    `a key missing here leaks across accounts on a shared device; got ${LOCAL_HEALTH_KEYS.join(", ")}`,
  );
}

console.log("\nthird-party minimisation\n");
{
  const context = {
    name: "Karmen",
    goalText: "travel without my back being the limit",
    ageYears: 29,
    profile_id: "abc-123",
    curvePattern: "right_thoracic",
    recentSessions: [
      {
        user_id: "u-1",
        pain: [{ location: "lumbar", intensity: 6 }],
        adherence: 0.7,
      },
    ],
    xray: { storage_path: "xrays/abc/spine.jpg", cobbAngle: 24 },
  };

  const clean = redactForThirdParty(context);

  check(
    "identifying fields are removed",
    !("name" in clean) && !("goalText" in clean) && !("ageYears" in clean),
    `still present: ${Object.keys(clean).join(", ")}`,
  );
  check(
    "clinical context is preserved",
    (clean as Record<string, unknown>).curvePattern === "right_thoracic",
    "redaction must not strip the reason for the call",
  );
  check(
    "nested identifiers are removed too",
    !JSON.stringify(clean).includes("u-1") &&
      !JSON.stringify(clean).includes("abc-123"),
    `a shallow strip misses nested profile objects; got ${JSON.stringify(clean)}`,
  );
  check(
    "a storage path to a radiograph does not leave",
    !JSON.stringify(clean).includes("spine.jpg"),
    "a file path is an identifier and a pointer at an image",
  );
  check(
    "nested clinical detail survives",
    JSON.stringify(clean).includes("lumbar") &&
      JSON.stringify(clean).includes("24"),
    "pain and measurements are why the call is being made",
  );
  check(
    "the detector agrees the redacted payload is clean",
    containsIdentifiers(context) && !containsIdentifiers(clean),
    "containsIdentifiers must catch what redactForThirdParty removes",
  );
  check(
    "arrays of contexts are handled",
    !containsIdentifiers(redactForThirdParty([context, context])),
    "batched calls must be redacted too",
  );
}

console.log("\nerasure completeness\n");
{
  // Every table carrying profile_id in the schema must be in the deletion
  // list. A table added later and forgotten here is data that survives a
  // deletion request.
  const EXPECTED = [
    "sessions",
    "xrays",
    "physio_programs",
    "monthly_assessments",
    "lifestyle_weekly",
    "personal_baselines",
    "pain_correlations",
    "cascade_predictions",
    "weekly_programs",
    "agent_observations",
    "agent_messages",
    "appointments",
    "liaison_documents",
    "notifications",
  ];
  const missing = EXPECTED.filter(
    (t) => !HEALTH_TABLES_CHILD_FIRST.includes(t as never),
  );
  check(
    "every profile-scoped table is in the deletion list",
    missing.length === 0,
    `would survive a deletion request: ${missing.join(", ")}`,
  );

  check(
    "children are deleted before parents",
    HEALTH_TABLES_CHILD_FIRST.indexOf("liaison_documents") <
      HEALTH_TABLES_CHILD_FIRST.indexOf("appointments"),
    "liaison_documents references appointments; deleting the parent first orphans the child",
  );

  check(
    "file storage is included in erasure",
    HEALTH_BUCKETS.includes("xrays") &&
      HEALTH_BUCKETS.includes("documents") &&
      HEALTH_BUCKETS.includes("monthly_assessments"),
    `a radiograph outlives the row that pointed at it; got ${HEALTH_BUCKETS.join(", ")}`,
  );
}

console.log(
  failures === 0 ? `\nall checks passed\n` : `\n${failures} check(s) failed\n`,
);
process.exit(failures === 0 ? 0 : 1);
