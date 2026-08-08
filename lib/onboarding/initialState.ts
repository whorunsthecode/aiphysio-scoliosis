import type { OnboardingState } from "./types";

export const initialOnboardingState: OnboardingState = {
  name: "",
  curveType: null,
  severity: null,
  primaryCurveApex: null,
  primaryLeanSide: null,
  secondaryCurveApex: null,
  secondaryLeanSide: null,
  segmentShifts: {
    cervical: null,
    upper_thoracic: null,
    lower_thoracic: null,
    lumbar: null,
  },
  xray: {
    fileName: null,
    fileSize: null,
    dataUrl: null,
    parsed: null,
    parseStatus: "idle",
    parseError: null,
    applied: false,
  },
  physioProgram: {
    rawText: "",
    parsed: null,
    parseStatus: "idle",
    parseError: null,
    clarifications: {},
  },
  lifestyle: {
    oneSidedSport: null,
    oneSidedSportFrequency: null,
    dailySittingHours: null,
    bagCarryingSide: null,
    sleepPosition: null,
  },
  pain: [],
  ageYears: null,
  // Empty, not all-false — an unanswered screening question is not a "no".
  safetyScreen: {},
};
