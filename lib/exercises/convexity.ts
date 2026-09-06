// Which side the curve bulges toward is the single fact every asymmetric
// exercise in this app hangs on. Get it backwards and the programme trains
// the curve deeper. It can come from three places — the user's own answer,
// an X-ray read, and the forward-bend (ATR) measurement — and none of the
// three is reliable enough alone to be trusted when the others disagree.
//
//   self-report   people confuse the hip that sticks out with the rib hump,
//                 and "left" in a mirror is "right" on the body
//   x-ray         a mirrored JPEG is indistinguishable from an unmirrored
//                 one without a laterality marker
//   ATR           correct in physics, but depends on the helper recording
//                 which way the phone pointed
//
// So: when two sources disagree, the side is set to unknown, the programme
// falls back to symmetric work, and the user is told to settle it with a
// clinician. Better a neutral session than a confidently wrong one.

import type { Side } from "@/lib/onboarding/types";

export type ConvexitySource = "self_report" | "xray" | "atr";

export type ConvexityInput = {
  source: ConvexitySource;
  side: Side | null;
};

export type ConvexityStatus = "unknown" | "single_source" | "agree" | "conflict";

export type ConvexityVerdict = {
  // The side to build a programme on. Null whenever it is not safe to pick.
  side: Side | null;
  status: ConvexityStatus;
  // Sources that contributed a non-null side.
  sources: ConvexityInput[];
  // What to tell the user. Null when there is nothing to say.
  note: string | null;
};

const LABEL: Record<ConvexitySource, string> = {
  self_report: "what you told me",
  xray: "the X-ray read",
  atr: "the forward-bend measurement",
};

export function reconcileConvexity(inputs: ConvexityInput[]): ConvexityVerdict {
  const known = inputs.filter((i): i is ConvexityInput & { side: Side } => i.side !== null);
  if (known.length === 0) {
    return { side: null, status: "unknown", sources: [], note: null };
  }
  const sides = new Set(known.map((k) => k.side));
  if (sides.size > 1) {
    const parts = known.map((k) => `${LABEL[k.source]} says ${k.side}`);
    return {
      side: null,
      status: "conflict",
      sources: known,
      note:
        `Your sources disagree about which side the curve bulges toward: ${parts.join(", ")}. ` +
        `Until that's settled I'll keep to exercises that don't depend on a side. ` +
        `Ask your physio which is right, then update it on the curve step.`,
    };
  }
  return {
    side: known[0].side,
    status: known.length === 1 ? "single_source" : "agree",
    sources: known,
    note: null,
  };
}

// ATR readings only vote when they are large enough to be unambiguous. A
// 2° reading is within the noise of a phone laid on a back, and its sign is
// not evidence of anything.
export const ATR_VOTE_MIN_DEG = 5;

export function atrSideFrom(peakDeg: number | null | undefined): Side | null {
  if (typeof peakDeg !== "number" || !Number.isFinite(peakDeg)) return null;
  if (Math.abs(peakDeg) < ATR_VOTE_MIN_DEG) return null;
  return peakDeg > 0 ? "right" : "left";
}
