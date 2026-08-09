// Privacy controls for health data.
//
// Everything this app holds is health data: pain logs, curve pattern, red-flag
// screen answers, and diagnostic images. Under HK PDPO that is personal data;
// under GDPR it is special-category data attracting the strictest handling;
// and none of it is data a user can meaningfully replace once leaked.
//
// Three rules this module enforces:
//
//   1. The browser holds the minimum. localStorage is readable by any script
//      on the origin, is not encrypted, and survives sign-out. Diagnostic
//      images and screening answers must never be written there.
//   2. Third parties see the minimum. Model providers receive clinical
//      context because they need it; they do not need names, ages, free-text
//      goals, or anything else that identifies whose spine it is.
//   3. The user can see everything held about them, and can delete it.
//      Access and erasure are legal rights, not features.

import type { OnboardingState } from "@/lib/onboarding/types";

// ───────────────────────── Local storage hygiene ─────────────────────────

// Every key this app writes to browser storage. Sign-out clears all of them;
// a key missing from this list is a key that leaks across accounts on a
// shared device.
export const LOCAL_HEALTH_KEYS = [
  "balance.profile",
  "balance.sessions",
] as const;

// Fields stripped before an onboarding state is written to localStorage.
//
// The X-ray is the important one. state.xray.dataUrl is a base64 diagnostic
// image; persisting it to localStorage leaves a radiograph in browser storage
// indefinitely, readable by any script on the origin and surviving sign-out.
// The parsed values the user confirmed are what the app actually uses — the
// image itself is only needed for the duration of the upload.
export function sanitiseForLocalStorage(
  state: OnboardingState,
): OnboardingState {
  return {
    ...state,
    xray: {
      ...state.xray,
      // Keep the filename so the UI can still say which file was read.
      dataUrl: null,
    },
    // Red-flag answers are the most sensitive thing a user tells this app.
    // They live server-side under RLS; there is no reason for a copy in the
    // browser, and a shared device would expose them.
    safetyScreen: undefined,
  };
}

export function clearLocalHealthData(): void {
  if (typeof window === "undefined") return;
  for (const key of LOCAL_HEALTH_KEYS) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Storage disabled or full — nothing recoverable to do.
    }
  }
}

// ─────────────────────── Third-party minimisation ───────────────────────

// Sent to a model provider, a curve pattern and a pain score are clinical
// context. A name, an age and a free-text goal are identity. The first is
// necessary; the second is not, and every field that leaves is a field
// sitting in someone else's logs.
export type ThirdPartyContext = Record<string, unknown>;

const IDENTIFYING_KEYS = new Set([
  "name",
  "goalText",
  "goal_text",
  "email",
  "phone",
  "ageYears",
  "age_years",
  "dateOfBirth",
  "userId",
  "user_id",
  "profileId",
  "profile_id",
  "chatId",
  "chat_id",
  "storagePath",
  "storage_path",
  "dataUrl",
]);

// Strip identifying fields from anything about to leave for a model provider.
// Recurses, because the context builders nest profile objects inside session
// objects and a shallow strip would miss them.
export function redactForThirdParty<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((v) => redactForThirdParty(v)) as unknown as T;
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (IDENTIFYING_KEYS.has(k)) continue;
      out[k] = redactForThirdParty(v);
    }
    return out as unknown as T;
  }
  return value;
}

// True when a payload still carries something identifying. Used by the checks
// so a new identifying field added to a context builder fails the build rather
// than quietly reaching a third party.
export function containsIdentifiers(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsIdentifiers);
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).some(
      ([k, v]) => IDENTIFYING_KEYS.has(k) || containsIdentifiers(v),
    );
  }
  return false;
}

// ───────────────────────────── Retention ─────────────────────────────

// Tables holding health data, in deletion order — children before parents, so
// a partial failure never orphans rows that RLS can no longer reach.
export const HEALTH_TABLES_CHILD_FIRST = [
  "liaison_documents",
  "appointments",
  "agent_messages",
  "agent_observations",
  "weekly_programs",
  "cascade_predictions",
  "pain_correlations",
  "personal_baselines",
  "notifications",
  "lifestyle_weekly",
  "monthly_assessments",
  "sessions",
  "xrays",
  "physio_programs",
] as const;

// Storage buckets holding user files. Deleting a profile must empty these too
// — a database row is not the whole record when radiographs live in object
// storage.
export const HEALTH_BUCKETS = [
  "xrays",
  "monthly_assessments",
  "documents",
] as const;
