export type CurveType = "S" | "C" | "thoracolumbar" | "unknown";
export type Severity = "mild" | "moderate" | "severe" | "unknown";
export type ApexRegion =
  | "cervical"
  | "upper_thoracic"
  | "lower_thoracic"
  | "thoracolumbar"
  | "lumbar";
export type Side = "left" | "right";
export type SegmentShift = "left" | "right" | "centered";
export type SleepPosition = "back" | "left" | "right" | "stomach" | "mixed";
export type BagSide = "left" | "right" | "alternating" | "backpack";
export type SittingHours = "under_4" | "4_to_8" | "8_to_12" | "over_12";
export type SportFrequency = "none" | "occasional" | "weekly" | "multiple";

export type PainPoint = {
  id: string;
  location: string;
  intensity: number; // 0-10
  type: "sharp" | "dull" | "ache" | "tingling";
};

export type OnboardingState = {
  name: string;

  curveType: CurveType | null;
  severity: Severity | null;
  primaryCurveApex: ApexRegion | null;
  primaryLeanSide: Side | null;
  secondaryCurveApex: ApexRegion | null;
  secondaryLeanSide: Side | null;

  segmentShifts: {
    cervical: SegmentShift | null;
    upper_thoracic: SegmentShift | null;
    lower_thoracic: SegmentShift | null;
    lumbar: SegmentShift | null;
  };

  xray: {
    fileName: string | null;
    fileSize: number | null;
    dataUrl: string | null;
    parsed: import("@/lib/prompts/xray").XrayAnalysis | null;
    parseStatus: "idle" | "loading" | "ok" | "error";
    parseError: string | null;
    applied: boolean;
  };

  physioProgram: {
    rawText: string;
    parsed: import("@/lib/prompts/parseProgram").ParsedProgram | null;
    parseStatus: "idle" | "loading" | "ok" | "error";
    parseError: string | null;
    // Per-exercise clarifications, keyed by exercise index in `parsed.exercises`.
    clarifications: Record<number, string>;
  };

  lifestyle: {
    oneSidedSport: string | null;
    oneSidedSportFrequency: SportFrequency | null;
    dailySittingHours: SittingHours | null;
    bagCarryingSide: BagSide | null;
    sleepPosition: SleepPosition | null;
  };

  pain: PainPoint[];
};

export const STEPS = [
  { id: "welcome", title: "Welcome" },
  { id: "curve", title: "Your curve" },
  { id: "segments", title: "Segmental shift" },
  { id: "xray", title: "X-ray" },
  { id: "program", title: "Physio program" },
  { id: "lifestyle", title: "Lifestyle" },
  { id: "pain", title: "How you feel" },
] as const;

export type StepId = (typeof STEPS)[number]["id"];
