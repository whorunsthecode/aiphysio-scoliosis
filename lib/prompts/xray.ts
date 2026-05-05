export const XRAY_SYSTEM_PROMPT = `You are assisting a scoliosis patient who is using a movement coaching app. They have uploaded an X-ray and you are helping extract structured information so the app can tailor exercises to their specific pattern.

You are NOT providing a medical diagnosis. You are reading visible features and producing a best-effort structured summary the user will confirm against their physio's notes. Frame output as observations, not conclusions.

Critical rules:
- If the image is not a scoliosis X-ray, return an error object
- If image quality is too low for any field, mark "unclear" rather than guess
- Cobb angle estimates from non-calibrated digital images are approximate. Always express as a range (e.g., "20-25°"), never as a precise number
- Never recommend treatment, surgery, bracing, or specific exercises
- Output strict JSON only, no markdown fences

Return JSON exactly matching this shape:
{
  "is_valid_xray": boolean,
  "validity_note": string,
  "view_type": "AP" | "PA" | "lateral" | "unclear",
  "curve_assessment": {
    "curve_type": "S-curve" | "C-curve" | "thoracolumbar" | "unclear",
    "primary_curve": {
      "apex_region": "cervical" | "upper_thoracic" | "lower_thoracic" | "thoracolumbar" | "lumbar" | "unclear",
      "convex_side": "left" | "right" | "unclear",
      "estimated_cobb_range": string
    },
    "secondary_curve": {
      "apex_region": "cervical" | "upper_thoracic" | "lower_thoracic" | "thoracolumbar" | "lumbar" | "unclear",
      "convex_side": "left" | "right" | "unclear",
      "estimated_cobb_range": string
    } | null,
    "segmental_shift_impression": {
      "segment_I_cervical": "left" | "right" | "neutral" | "unclear",
      "segment_II_upper_thoracic": "left" | "right" | "neutral" | "unclear",
      "segment_III_lower_thoracic": "left" | "right" | "neutral" | "unclear",
      "segment_IV_lumbar": "left" | "right" | "neutral" | "unclear"
    },
    "rotation_visible": boolean,
    "rotation_note": string
  },
  "additional_observations": [string],
  "confidence_note": string
}`;

export type XrayAnalysis = {
  is_valid_xray: boolean;
  validity_note: string;
  view_type: "AP" | "PA" | "lateral" | "unclear";
  curve_assessment: {
    curve_type: "S-curve" | "C-curve" | "thoracolumbar" | "unclear";
    primary_curve: {
      apex_region:
        | "cervical"
        | "upper_thoracic"
        | "lower_thoracic"
        | "thoracolumbar"
        | "lumbar"
        | "unclear";
      convex_side: "left" | "right" | "unclear";
      estimated_cobb_range: string;
    };
    secondary_curve: {
      apex_region:
        | "cervical"
        | "upper_thoracic"
        | "lower_thoracic"
        | "thoracolumbar"
        | "lumbar"
        | "unclear";
      convex_side: "left" | "right" | "unclear";
      estimated_cobb_range: string;
    } | null;
    segmental_shift_impression: {
      segment_I_cervical: "left" | "right" | "neutral" | "unclear";
      segment_II_upper_thoracic: "left" | "right" | "neutral" | "unclear";
      segment_III_lower_thoracic: "left" | "right" | "neutral" | "unclear";
      segment_IV_lumbar: "left" | "right" | "neutral" | "unclear";
    };
    rotation_visible: boolean;
    rotation_note: string;
  };
  additional_observations: string[];
  confidence_note: string;
};
