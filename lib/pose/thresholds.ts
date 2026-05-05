// Alignment thresholds. Three bands per measurement:
//   within  → green / sage    (no concern)
//   monitor → soft amber-coral (worth tracking)
//   significant → terracotta  (worth flagging)

export type AlignmentTone = "within" | "monitor" | "significant";

export const TONE_COLORS: Record<AlignmentTone, string> = {
  within: "#7fa78a", // sage
  monitor: "#e8a397", // drift / soft coral
  significant: "#c98870", // terracotta
};

export const TONE_LABELS: Record<AlignmentTone, string> = {
  within: "within range",
  monitor: "monitor",
  significant: "significant",
};

export function classify(
  valueMm: number,
  bands: { within: number; monitor: number },
): AlignmentTone {
  const v = Math.abs(valueMm);
  if (v <= bands.within) return "within";
  if (v <= bands.monitor) return "monitor";
  return "significant";
}

// Per-measurement threshold bands.
export const BANDS = {
  shoulder: { within: 5, monitor: 15 },
  hip: { within: 5, monitor: 15 },
  head: { within: 10, monitor: 25 },
  segment: { within: 5, monitor: 15 },
  pelvicRotation: { within: 4, monitor: 12 },
} as const;
