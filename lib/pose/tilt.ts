// DeviceOrientationEvent helpers. iOS Safari requires
// `DeviceOrientationEvent.requestPermission()` to be called from a user
// gesture before any orientation events fire. Most desktops have no sensor
// at all — feature-detect and fall back gracefully.

export type Tilt = {
  // Front-to-back tilt, -180..180. Phone held vertically (portrait, screen
  // facing user) sits near 90.
  beta: number | null;
  // Left-to-right tilt, -90..90. 0 = perfectly level on the long axis.
  gamma: number | null;
};

export type TiltSupport =
  | "supported" // events expected to fire
  | "needs_permission" // iOS, must request before reading
  | "unsupported"; // no sensor (desktop, etc.)

export function detectTiltSupport(): TiltSupport {
  if (typeof window === "undefined" || typeof DeviceOrientationEvent === "undefined") {
    return "unsupported";
  }
  const requestPerm = (
    DeviceOrientationEvent as unknown as {
      requestPermission?: () => Promise<"granted" | "denied">;
    }
  ).requestPermission;
  if (typeof requestPerm === "function") return "needs_permission";
  return "supported";
}

export async function requestTiltPermission(): Promise<boolean> {
  if (typeof DeviceOrientationEvent === "undefined") return false;
  const requestPerm = (
    DeviceOrientationEvent as unknown as {
      requestPermission?: () => Promise<"granted" | "denied">;
    }
  ).requestPermission;
  if (typeof requestPerm !== "function") return true;
  try {
    const result = await requestPerm();
    return result === "granted";
  } catch {
    return false;
  }
}

// Phone is "vertical" when beta is near 90 (held upright) AND gamma is near 0
// (not rolled left/right). Threshold: ±2°. Spec target.
export const TILT_TOLERANCE_DEG = 2;
export const TILT_STABLE_MS = 3000; // continuous-stable window before scan

export function isTiltVertical(tilt: Tilt): boolean {
  if (tilt.beta === null || tilt.gamma === null) return false;
  return (
    Math.abs(tilt.beta - 90) <= TILT_TOLERANCE_DEG &&
    Math.abs(tilt.gamma) <= TILT_TOLERANCE_DEG
  );
}

// Returns a magnitude for the worst tilt axis, in degrees. Useful for live
// indicator rendering.
export function tiltError(tilt: Tilt): number | null {
  if (tilt.beta === null || tilt.gamma === null) return null;
  return Math.max(Math.abs(tilt.beta - 90), Math.abs(tilt.gamma));
}
