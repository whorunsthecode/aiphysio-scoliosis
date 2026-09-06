// The latest forward-bend peak, kept in the browser so the session page can
// cross-check it against the self-reported convex side. Side and degrees
// only — no readings, no timestamps beyond "when". Listed in
// LOCAL_HEALTH_KEYS so sign-out clears it.

import type { TrunkLevel } from "./compute";

export const ATR_STORAGE_KEY = "balance.atr";

export type StoredAtrPeak = { at: string; peakDeg: number; level: TrunkLevel };

export function saveAtrPeak(peak: StoredAtrPeak): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ATR_STORAGE_KEY, JSON.stringify(peak));
  } catch {
    // Storage unavailable — the cross-check simply has one fewer source.
  }
}

export function loadAtrPeak(): StoredAtrPeak | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(ATR_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredAtrPeak>;
    if (typeof parsed.peakDeg !== "number" || !Number.isFinite(parsed.peakDeg)) return null;
    return {
      at: typeof parsed.at === "string" ? parsed.at : "",
      peakDeg: parsed.peakDeg,
      level: (parsed.level ?? "main_thoracic") as TrunkLevel,
    };
  } catch {
    return null;
  }
}
