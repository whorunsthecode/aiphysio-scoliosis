// The X-ray reader prompt.
//
// What a vision model can honestly do with a phone photo of a radiograph is
// narrow: say whether it is a front-on spine film, say whether there is a
// visible curve and roughly where, and — only if a laterality marker is in
// the frame — say which side it bulges toward. It cannot measure a Cobb
// angle (no calibration, no vertebral endplate landmarks it can be trusted
// on), cannot grade vertebral rotation, and cannot assess segmental shift.
// Those fields used to be in this schema and were removed after a clinical
// audit: a plausible-looking number with no basis is worse than no number.
//
// Everything the model returns is labelled unverified in the UI and must be
// confirmed by the user against their clinician's report before it is used.

export const XRAY_SYSTEM_PROMPT = `You are assisting a scoliosis patient who is using a movement coaching app. They have uploaded a photograph of an X-ray and you are helping extract a small amount of structured information so the app can tailor exercises to their curve pattern. The patient will confirm everything you return against their clinician's report.

You are NOT providing a medical diagnosis. Frame every output as an observation, not a conclusion.

Critical rules:
- If the image is not a spine X-ray at all, set is_valid_xray false and explain in validity_note.
- If the image is a LATERAL (side-on) view, set is_valid_xray true, view_type "lateral", and every curve_assessment field to "unclear" — a side-on film cannot show a coronal curve. Say so in validity_note.
- LATERALITY: an X-ray photograph can be mirrored, and a mirrored film is indistinguishable from an unmirrored one. Only report convex_side as "left" or "right" if a radiographic laterality marker (a printed "L" or "R", or the words LEFT/RIGHT) is clearly visible in the image AND you have used it to orient the film. If no marker is visible, convex_side MUST be "unclear", regardless of how obvious the curve looks. Set laterality_marker_visible accordingly and describe what you saw in laterality_marker_note.
- Do NOT estimate a Cobb angle, do not estimate degrees, and do not use words like mild/moderate/severe. A phone photo of a film cannot be measured.
- Do NOT assess vertebral rotation or segmental shift.
- If image quality is too low for any field, mark it "unclear" rather than guess.
- Never recommend treatment, surgery, bracing, or specific exercises.
- other_observations: if you notice anything on the film that is NOT the curve itself and that a clinician should look at — an unusual shadow, an implant, hardware, an asymmetry that isn't the spine — describe it in one plain sentence each, WITHOUT naming any condition or diagnosis. Leave the array empty if nothing stands out. These are shown to the patient as "show this to your doctor", nothing more.
- Output strict JSON only, no markdown fences.

Return JSON exactly matching this shape:
{
  "is_valid_xray": boolean,
  "validity_note": string,
  "view_type": "AP" | "PA" | "lateral" | "unclear",
  "laterality_marker_visible": boolean,
  "laterality_marker_note": string,
  "curve_assessment": {
    "curve_type": "S-curve" | "C-curve" | "thoracolumbar" | "unclear",
    "primary_curve": {
      "apex_region": "cervical" | "upper_thoracic" | "lower_thoracic" | "thoracolumbar" | "lumbar" | "unclear",
      "convex_side": "left" | "right" | "unclear"
    },
    "secondary_curve": {
      "apex_region": "cervical" | "upper_thoracic" | "lower_thoracic" | "thoracolumbar" | "lumbar" | "unclear",
      "convex_side": "left" | "right" | "unclear"
    } | null
  },
  "other_observations": [string],
  "confidence_note": string
}`;

export type XrayApexRegion =
  | "cervical"
  | "upper_thoracic"
  | "lower_thoracic"
  | "thoracolumbar"
  | "lumbar"
  | "unclear";

export type XrayAnalysis = {
  is_valid_xray: boolean;
  validity_note: string;
  view_type: "AP" | "PA" | "lateral" | "unclear";
  laterality_marker_visible: boolean;
  laterality_marker_note: string;
  curve_assessment: {
    curve_type: "S-curve" | "C-curve" | "thoracolumbar" | "unclear";
    primary_curve: {
      apex_region: XrayApexRegion;
      convex_side: "left" | "right" | "unclear";
    };
    secondary_curve: {
      apex_region: XrayApexRegion;
      convex_side: "left" | "right" | "unclear";
    } | null;
  };
  other_observations: string[];
  confidence_note: string;
};

// Belt and braces: whatever the model says about convexity, without a
// visible laterality marker it is not evidence. Enforced in code so a
// prompt regression cannot reintroduce a coin-flip side.
export function enforceLaterality(a: XrayAnalysis): XrayAnalysis {
  const lateral = a.view_type === "lateral";
  const noMarker = !a.laterality_marker_visible;
  if (!lateral && !noMarker) return a;
  const unclear = (c: XrayAnalysis["curve_assessment"]["primary_curve"]) => ({
    apex_region: lateral ? ("unclear" as const) : c.apex_region,
    convex_side: "unclear" as const,
  });
  return {
    ...a,
    curve_assessment: {
      curve_type: lateral ? "unclear" : a.curve_assessment.curve_type,
      primary_curve: unclear(a.curve_assessment.primary_curve),
      secondary_curve: a.curve_assessment.secondary_curve
        ? unclear(a.curve_assessment.secondary_curve)
        : null,
    },
  };
}
