"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  AlertCircle,
  Camera,
  CameraOff,
  CheckCircle2,
  Compass,
  Loader2,
  RefreshCw,
  ScanLine,
  Smartphone,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { TagPill } from "@/components/ui/TagPill";
import { StickerOverlay } from "@/components/pose/StickerOverlay";
import { MeasurementRow } from "@/components/pose/MeasurementRow";
import {
  bodyRotationDeg,
  computePosture,
  smoothMeasurements,
} from "@/lib/pose/compute";
import {
  BANDS,
  TONE_COLORS,
  TONE_LABELS,
  classify,
  type AlignmentTone,
} from "@/lib/pose/thresholds";
import {
  POSE,
  type NormalizedLandmark,
  type PostureMeasurements,
} from "@/lib/pose/types";
import {
  TILT_STABLE_MS,
  TILT_TOLERANCE_DEG,
  detectTiltSupport,
  isTiltVertical,
  requestTiltPermission,
  tiltError,
  type Tilt,
  type TiltSupport,
} from "@/lib/pose/tilt";
import {
  aggregateScanFrames,
  bandFromCv,
  evaluateRejection,
  rejectionAdvice,
  type PostureSnapshot,
  type RejectionReason,
  type ScanConfidence,
} from "@/lib/pose/stats";

const CAPTURE_DURATION_MS = 10_000;
const CAPTURE_FRAME_INTERVAL_MS = 100; // 10 fps target
const POSE_CONFIDENCE_FLOOR = 0.55; // gate before considering torso "visible"
const READY_LANDMARK_KEYS = [
  POSE.LEFT_SHOULDER,
  POSE.RIGHT_SHOULDER,
  POSE.LEFT_HIP,
  POSE.RIGHT_HIP,
  POSE.NOSE,
] as const;

type Status =
  | "idle"
  | "loading_model"
  | "requesting_camera"
  | "needs_tilt_permission"
  | "calibrating_tilt"
  | "ready_to_capture"
  | "capturing"
  | "analyzing"
  | "captured"
  | "failed";

type Failure = {
  reason: RejectionReason | "permission_denied" | "no_camera" | "model_error";
  message: string;
};

interface PoseScannerProps {
  onCapture?: (snapshot: PostureSnapshot) => void;
  // If null, capture begins on user click. If a number, begins automatically
  // once tilt + pose are both stable.
  autoCaptureMs?: number | null;
}

export function PoseScanner({
  onCapture,
  autoCaptureMs = null,
}: PoseScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Live values during streaming (single-frame, smoothed) for the overlay +
  // live readout.
  const liveMeasurementsRef = useRef<PostureMeasurements | null>(null);

  // Rolling buffers used while in `capturing` to compute the snapshot.
  const captureFramesRef = useRef<PostureMeasurements[]>([]);
  const captureRotationsRef = useRef<number[]>([]);
  const capturePoseConfRef = useRef<number[]>([]);
  const captureStartedAtRef = useRef<number>(0);
  const lastCaptureTsRef = useRef<number>(0);

  // Tilt-stability tracking (continuous-OK window length in ms).
  const tiltOkSinceRef = useRef<number | null>(null);

  const [status, setStatus] = useState<Status>("idle");
  const [failure, setFailure] = useState<Failure | null>(null);
  const [landmarks, setLandmarks] = useState<NormalizedLandmark[] | null>(null);
  const [liveMeasurements, setLiveMeasurements] =
    useState<PostureMeasurements | null>(null);
  const [snapshot, setSnapshot] = useState<PostureSnapshot | null>(null);
  const [boxSize, setBoxSize] = useState<{ w: number; h: number }>({
    w: 640,
    h: 480,
  });
  const [tilt, setTilt] = useState<Tilt>({ beta: null, gamma: null });
  const [tiltSupport, setTiltSupport] = useState<TiltSupport>("supported");
  const [tiltStableMs, setTiltStableMs] = useState<number>(0);
  const [captureProgress, setCaptureProgress] = useState<number>(0);

  // Track displayed video size so the overlay matches.
  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setBoxSize({ w: width, h: height });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Detect tilt sensor on mount.
  useEffect(() => {
    setTiltSupport(detectTiltSupport());
  }, []);

  // Subscribe to deviceorientation while we need it (calibrating + capturing).
  useEffect(() => {
    if (status !== "calibrating_tilt" && status !== "capturing") return;
    if (tiltSupport !== "supported") return;

    const handler = (event: DeviceOrientationEvent) => {
      setTilt({ beta: event.beta, gamma: event.gamma });
    };
    window.addEventListener("deviceorientation", handler, true);
    return () => window.removeEventListener("deviceorientation", handler, true);
  }, [status, tiltSupport]);

  const stopStream = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const fullReset = useCallback(() => {
    stopStream();
    liveMeasurementsRef.current = null;
    captureFramesRef.current = [];
    captureRotationsRef.current = [];
    capturePoseConfRef.current = [];
    tiltOkSinceRef.current = null;
    setLandmarks(null);
    setLiveMeasurements(null);
    setTiltStableMs(0);
    setCaptureProgress(0);
  }, [stopStream]);

  useEffect(() => () => fullReset(), [fullReset]);

  const beginCapture = useCallback(() => {
    captureFramesRef.current = [];
    captureRotationsRef.current = [];
    capturePoseConfRef.current = [];
    captureStartedAtRef.current = performance.now();
    lastCaptureTsRef.current = 0;
    setCaptureProgress(0);
    setStatus("capturing");
  }, []);

  const finishCapture = useCallback(() => {
    setStatus("analyzing");
    const frames = captureFramesRef.current;
    if (frames.length === 0) {
      setFailure({
        reason: "no_pose",
        message: rejectionAdvice("no_pose"),
      });
      setStatus("failed");
      stopStream();
      return;
    }
    const snap = aggregateScanFrames(frames, {
      bodyRotationsDeg: captureRotationsRef.current,
      poseConfidences: capturePoseConfRef.current,
    });
    const reject = evaluateRejection(snap);
    if (reject) {
      setFailure({ reason: reject, message: rejectionAdvice(reject) });
      setStatus("failed");
      stopStream();
      return;
    }
    setSnapshot(snap);
    onCapture?.(snap);
    setStatus("captured");
    stopStream();
  }, [onCapture, stopStream]);

  const startScanFlow = async () => {
    setFailure(null);
    setStatus("loading_model");
    try {
      // Load MoveNet (scan-accuracy model) and the adapter.
      const [{ getMoveNetDetector, detectMoveNet }, { adaptMoveNetToLandmarks }] =
        await Promise.all([
          import("@/lib/pose/movenet"),
          import("@/lib/pose/adapter"),
        ]);
      const detector = await getMoveNetDetector();

      // Camera.
      setStatus("requesting_camera");
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: "user",
        },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) throw new Error("Video element not available");
      video.srcObject = stream;
      await video.play();

      // Tilt: ask for permission if iOS, else go straight to calibration.
      if (tiltSupport === "needs_permission") {
        setStatus("needs_tilt_permission");
        return;
      }
      setStatus(
        tiltSupport === "supported" ? "calibrating_tilt" : "ready_to_capture",
      );

      // Per-frame loop.
      tiltOkSinceRef.current = null;
      const tick = async () => {
        const v = videoRef.current;
        if (!v || v.readyState < 2) {
          rafRef.current = requestAnimationFrame(tick);
          return;
        }
        try {
          const pose = await detectMoveNet(detector, v);
          const lms = adaptMoveNetToLandmarks(
            pose,
            v.videoWidth || 1280,
            v.videoHeight || 720,
          );

          if (lms) {
            const torsoVisible = READY_LANDMARK_KEYS.every(
              (k) => (lms[k]?.visibility ?? 0) > POSE_CONFIDENCE_FLOOR,
            );
            setLandmarks(lms);

            if (torsoVisible) {
              const next = computePosture(lms);
              if (next) {
                const smoothed = smoothMeasurements(
                  liveMeasurementsRef.current,
                  next,
                );
                liveMeasurementsRef.current = smoothed;
                setLiveMeasurements(smoothed);

                // While capturing: throttle to 10 fps and stash frames.
                const now = performance.now();
                setStatus((cur) => {
                  if (cur === "capturing") {
                    const elapsed = now - captureStartedAtRef.current;
                    setCaptureProgress(
                      Math.min(1, elapsed / CAPTURE_DURATION_MS),
                    );
                    if (
                      now - lastCaptureTsRef.current >=
                      CAPTURE_FRAME_INTERVAL_MS
                    ) {
                      lastCaptureTsRef.current = now;
                      captureFramesRef.current.push(next);
                      captureRotationsRef.current.push(bodyRotationDeg(lms));
                      capturePoseConfRef.current.push(next.confidence);
                    }
                    if (elapsed >= CAPTURE_DURATION_MS) {
                      // schedule outside of state-setter
                      queueMicrotask(finishCapture);
                    }
                  }
                  return cur;
                });
              }
            }
          } else {
            setLandmarks(null);
          }
        } catch {
          // ignore individual frame errors
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      const reason: Failure["reason"] =
        msg.includes("Permission") || msg.includes("NotAllowed")
          ? "permission_denied"
          : msg.includes("NotFound")
            ? "no_camera"
            : "model_error";
      const message =
        reason === "permission_denied"
          ? "Camera permission was denied. Allow camera access in your browser to scan."
          : reason === "no_camera"
            ? "I couldn't find a camera on this device."
            : msg;
      setFailure({ reason, message });
      setStatus("failed");
      fullReset();
    }
  };

  // iOS permission button handler.
  const grantTiltPermission = async () => {
    const ok = await requestTiltPermission();
    if (ok) {
      setStatus("calibrating_tilt");
    } else {
      // Proceed without tilt — better UX than blocking entirely.
      setStatus("ready_to_capture");
    }
  };

  // Drive the tilt-stability accumulator + auto-advance to ready.
  useEffect(() => {
    if (status !== "calibrating_tilt") {
      setTiltStableMs(0);
      tiltOkSinceRef.current = null;
      return;
    }
    if (tiltSupport !== "supported") return;
    const interval = window.setInterval(() => {
      const ok = isTiltVertical(tilt);
      const now = performance.now();
      if (ok) {
        if (tiltOkSinceRef.current === null) {
          tiltOkSinceRef.current = now;
          setTiltStableMs(0);
        } else {
          const ms = now - tiltOkSinceRef.current;
          setTiltStableMs(ms);
          if (ms >= TILT_STABLE_MS) {
            setStatus("ready_to_capture");
            window.clearInterval(interval);
          }
        }
      } else {
        tiltOkSinceRef.current = null;
        setTiltStableMs(0);
      }
    }, 100);
    return () => window.clearInterval(interval);
  }, [status, tilt, tiltSupport]);

  // While capturing: pause if tilt drifts.
  useEffect(() => {
    if (status !== "capturing") return;
    if (tiltSupport !== "supported") return;
    if (!isTiltVertical(tilt)) {
      setFailure({
        reason: "tilt_drifted",
        message: rejectionAdvice("tilt_drifted"),
      });
      setStatus("failed");
      stopStream();
    }
  }, [status, tilt, tiltSupport, stopStream]);

  // Auto-capture once ready, if requested.
  useEffect(() => {
    if (status !== "ready_to_capture") return;
    if (autoCaptureMs == null) return;
    const t = window.setTimeout(beginCapture, autoCaptureMs);
    return () => window.clearTimeout(t);
  }, [status, autoCaptureMs, beginCapture]);

  const reset = () => {
    fullReset();
    setSnapshot(null);
    setFailure(null);
    setStatus("idle");
  };

  const active =
    status === "calibrating_tilt" ||
    status === "ready_to_capture" ||
    status === "capturing";

  const tiltErr = tiltError(tilt);
  const tiltOk = isTiltVertical(tilt);
  const showCaptureButton = status === "ready_to_capture";

  // Live readout vs final snapshot.
  const display = snapshot?.measurements ?? liveMeasurements;
  const finalConfidence = snapshot?.scanConfidence ?? null;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      {/* Video stage */}
      <div
        ref={containerRef}
        className="relative aspect-video w-full overflow-hidden rounded-card bg-ink-primary shadow-card"
      >
        <video
          ref={videoRef}
          className={
            "absolute inset-0 h-full w-full object-cover " +
            (active ? "scale-x-[-1]" : "opacity-0")
          }
          playsInline
          muted
        />
        {active && landmarks ? (
          <StickerOverlay
            landmarks={landmarks}
            width={boxSize.w}
            height={boxSize.h}
            mirror
          />
        ) : null}

        {/* Tucked overlay readout */}
        {active && liveMeasurements ? (
          <div className="absolute right-4 top-4 rounded-2xl bg-base/85 px-3 py-2 text-[11px] backdrop-blur-sm">
            <div className="font-mono text-ink-primary">
              {Math.round(liveMeasurements.overallScore)}
            </div>
            <div className="text-[10px] uppercase tracking-[0.14em] text-ink-secondary">
              live score
            </div>
          </div>
        ) : null}

        {/* Tilt indicator (top-left) */}
        {(status === "calibrating_tilt" || status === "capturing") &&
        tiltSupport === "supported" ? (
          <div
            className={
              "absolute left-4 top-4 flex items-center gap-2 rounded-full px-3 py-1.5 text-[12px] backdrop-blur-sm " +
              (tiltOk
                ? "bg-sage/90 text-white"
                : "bg-terracotta/85 text-white")
            }
          >
            <Smartphone size={13} strokeWidth={1.8} />
            {tiltErr === null
              ? "waiting for tilt sensor"
              : tiltOk
                ? `level · stable ${(tiltStableMs / 1000).toFixed(1)}s`
                : `tilt off by ${tiltErr.toFixed(1)}°`}
          </div>
        ) : null}

        {/* Idle / loading / error overlays */}
        {!active && status !== "captured" && status !== "failed" ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-6 text-center">
            {status === "idle" ? (
              <CenterAction icon={<Camera size={26} strokeWidth={1.5} />}>
                <Button
                  variant="primary"
                  onClick={startScanFlow}
                  leftIcon={<Camera size={18} strokeWidth={1.5} />}
                >
                  Start camera
                </Button>
                <p className="mt-3 text-[12px] text-base/80">
                  Allows webcam access · no data leaves your device
                </p>
              </CenterAction>
            ) : null}

            {status === "loading_model" || status === "requesting_camera" ? (
              <CenterAction
                icon={
                  <Loader2
                    size={26}
                    strokeWidth={1.5}
                    className="animate-spin"
                  />
                }
              >
                <p className="text-[14px] text-base/85">
                  {status === "loading_model"
                    ? "Loading pose model…"
                    : "Asking for camera access…"}
                </p>
              </CenterAction>
            ) : null}

            {status === "needs_tilt_permission" ? (
              <CenterAction icon={<Compass size={26} strokeWidth={1.5} />}>
                <div className="max-w-sm space-y-3">
                  <p className="text-[14px] text-base/85">
                    I use your phone&rsquo;s tilt sensors to make sure the
                    camera is level — it dramatically improves accuracy.
                  </p>
                  <Button variant="primary" onClick={grantTiltPermission}>
                    Allow tilt sensor
                  </Button>
                </div>
              </CenterAction>
            ) : null}

            {status === "analyzing" ? (
              <CenterAction
                icon={
                  <Loader2
                    size={26}
                    strokeWidth={1.5}
                    className="animate-spin"
                  />
                }
              >
                <p className="text-[14px] text-base/85">
                  Computing your measurements…
                </p>
              </CenterAction>
            ) : null}
          </div>
        ) : null}

        {status === "captured" && snapshot ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-6 text-center">
            <CenterAction icon={<CheckCircle2 size={26} strokeWidth={1.5} />}>
              <p className="text-[14px] text-base/85">
                Captured {snapshot.framesUsed} frames over 10s.
              </p>
              <Button
                variant="secondary"
                onClick={reset}
                leftIcon={<RefreshCw size={16} strokeWidth={1.5} />}
              >
                Scan again
              </Button>
            </CenterAction>
          </div>
        ) : null}

        {status === "failed" && failure ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-6 text-center">
            <CenterAction icon={<CameraOff size={26} strokeWidth={1.5} />}>
              <p className="max-w-md text-[14px] text-base/85">
                I couldn&rsquo;t get a confident reading this time.
              </p>
              <p className="max-w-md text-[13px] text-base/70">
                {failure.message}
              </p>
              <Button variant="secondary" onClick={reset}>
                Try again
              </Button>
            </CenterAction>
          </div>
        ) : null}

        {/* Capture progress ring + capture button */}
        {showCaptureButton ? (
          <div className="absolute bottom-5 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2">
            <Button
              variant="primary"
              onClick={beginCapture}
              leftIcon={<ScanLine size={18} strokeWidth={1.5} />}
            >
              Hold still — start 10s capture
            </Button>
            <p className="text-[11px] text-base/75">
              Stand square, arms relaxed at your sides
            </p>
          </div>
        ) : null}
        {status === "capturing" ? (
          <div className="absolute bottom-5 left-1/2 -translate-x-1/2 flex w-72 flex-col items-center gap-2">
            <div className="h-2 w-full overflow-hidden rounded-full bg-white/15">
              <div
                className="h-full rounded-full bg-sage transition-[width] duration-100 ease-linear"
                style={{ width: `${captureProgress * 100}%` }}
              />
            </div>
            <p className="text-[12px] text-base/85">
              Capturing… stay still ({Math.ceil((1 - captureProgress) * 10)}s
              left)
            </p>
          </div>
        ) : null}
      </div>

      {/* Sidebar */}
      <div className="space-y-4">
        <Card padding="md">
          <div className="flex items-start justify-between gap-3">
            <SectionLabel>Overall score</SectionLabel>
            {finalConfidence ? (
              <ConfidenceBadge band={finalConfidence} />
            ) : null}
          </div>
          <p
            className="mt-3 font-display text-[44px] leading-none font-bold tracking-[-0.01em] font-numerals"
            style={{
              color: display
                ? scoreColor(display.overallScore)
                : "var(--color-ink-tertiary)",
            }}
          >
            {display ? Math.round(display.overallScore) : "—"}
          </p>
          <p className="mt-2 text-[13px] text-ink-tertiary">
            composite alignment, 0–100
          </p>
          {snapshot ? (
            <p className="mt-3 text-[12px] text-ink-tertiary">
              {snapshot.framesUsed} frames · pose conf{" "}
              {Math.round(snapshot.meanPoseConfidence * 100)}% · max body
              rotation {snapshot.bodyRotationMaxDeg.toFixed(1)}°
            </p>
          ) : null}
        </Card>

        <Card padding="md">
          <SectionLabel>Live markers</SectionLabel>
          <div className="mt-2 divide-y divide-border/60">
            <ConfidenceMeasurementRow
              label="Shoulder diff"
              valueMm={display?.shoulderDiffMm ?? null}
              cv={snapshot?.stats.shoulderDiff.cv ?? null}
              std={snapshot?.stats.shoulderDiff.std ?? null}
              tone={
                display
                  ? classify(display.shoulderDiffMm, BANDS.shoulder)
                  : null
              }
              directionLabels={{
                positive: "left higher",
                negative: "right higher",
              }}
            />
            <ConfidenceMeasurementRow
              label="Hip diff"
              valueMm={display?.hipDiffMm ?? null}
              cv={snapshot?.stats.hipDiff.cv ?? null}
              std={snapshot?.stats.hipDiff.std ?? null}
              tone={display ? classify(display.hipDiffMm, BANDS.hip) : null}
              directionLabels={{
                positive: "left higher",
                negative: "right higher",
              }}
            />
            <ConfidenceMeasurementRow
              label="Head over pelvis"
              valueMm={display?.headOffsetMm ?? null}
              cv={snapshot?.stats.headOffset.cv ?? null}
              std={snapshot?.stats.headOffset.std ?? null}
              tone={display ? classify(display.headOffsetMm, BANDS.head) : null}
              directionLabels={{
                positive: "shifted right",
                negative: "shifted left",
              }}
            />
            <ConfidenceMeasurementRow
              label="Pelvic rotation"
              valueMm={display?.pelvicRotationMm ?? null}
              cv={snapshot?.stats.pelvicRotation.cv ?? null}
              std={snapshot?.stats.pelvicRotation.std ?? null}
              tone={
                display
                  ? classify(display.pelvicRotationMm, BANDS.pelvicRotation)
                  : null
              }
            />
          </div>
        </Card>

        <Card padding="md">
          <SectionLabel>Segmental deviation</SectionLabel>
          <div className="mt-2 divide-y divide-border/60">
            <ConfidenceMeasurementRow
              label="I · cervical"
              valueMm={display?.segments.cervical ?? null}
              cv={snapshot?.stats.cervical.cv ?? null}
              std={snapshot?.stats.cervical.std ?? null}
              tone={
                display
                  ? classify(display.segments.cervical, BANDS.segment)
                  : null
              }
            />
            <ConfidenceMeasurementRow
              label="II · upper thoracic"
              valueMm={display?.segments.upperThoracic ?? null}
              cv={snapshot?.stats.upperThoracic.cv ?? null}
              std={snapshot?.stats.upperThoracic.std ?? null}
              tone={
                display
                  ? classify(
                      display.segments.upperThoracic,
                      BANDS.segment,
                    )
                  : null
              }
            />
            <ConfidenceMeasurementRow
              label="III · lower thoracic"
              valueMm={display?.segments.lowerThoracic ?? null}
              cv={snapshot?.stats.lowerThoracic.cv ?? null}
              std={snapshot?.stats.lowerThoracic.std ?? null}
              tone={
                display
                  ? classify(
                      display.segments.lowerThoracic,
                      BANDS.segment,
                    )
                  : null
              }
            />
            <MeasurementRow
              label="IV · lumbar (ref)"
              valueMm={display ? 0 : null}
              tone={"within"}
            />
          </div>
        </Card>

        <Card padding="md" tone="muted">
          <SectionLabel>Legend</SectionLabel>
          <ul className="mt-2 space-y-1.5 text-[12px]">
            {(["within", "monitor", "significant"] as AlignmentTone[]).map(
              (t) => (
                <li key={t} className="flex items-center gap-2">
                  <span
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ backgroundColor: TONE_COLORS[t] }}
                  />
                  <span className="text-ink-secondary">{toneRange(t)}</span>
                  <span className="text-ink-tertiary">· {TONE_LABELS[t]}</span>
                </li>
              ),
            )}
          </ul>
          {tiltSupport === "unsupported" ? (
            <p className="mt-3 text-[11px] text-ink-tertiary">
              No tilt sensor on this device — make sure your camera is level.
            </p>
          ) : tiltSupport === "supported" ? (
            <p className="mt-3 text-[11px] text-ink-tertiary">
              Phone must be within ±{TILT_TOLERANCE_DEG}° of vertical for{" "}
              {TILT_STABLE_MS / 1000}s before scan begins.
            </p>
          ) : null}
        </Card>
      </div>
    </div>
  );
}

function CenterAction({
  icon,
  children,
}: {
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 text-base/85">
      <div className="grid h-14 w-14 place-items-center rounded-full bg-white/10 text-base">
        {icon}
      </div>
      {children}
    </div>
  );
}

function ConfidenceBadge({ band }: { band: ScanConfidence }) {
  const tone = band === "high" ? "sage" : band === "moderate" ? "neutral" : "terracotta";
  const label =
    band === "high"
      ? "high confidence"
      : band === "moderate"
        ? "moderate confidence"
        : "low — try again";
  return <TagPill tone={tone}>{label}</TagPill>;
}

function ConfidenceMeasurementRow({
  label,
  valueMm,
  cv,
  std,
  tone,
  directionLabels,
}: {
  label: string;
  valueMm: number | null;
  cv: number | null;
  std: number | null;
  tone: AlignmentTone | null;
  directionLabels?: { positive: string; negative: string };
}) {
  // Per Add 3: if CV > 0.25 don't show the number at all.
  const band = cv === null ? null : bandFromCv(cv);
  const hideValue = band === "low";
  const muted = band === "moderate";

  if (hideValue) {
    return (
      <div className="flex items-center justify-between gap-3 py-2">
        <div>
          <p className="text-[14px] text-ink-primary">{label}</p>
          <p className="text-[11px] text-ink-tertiary">unstable — try again</p>
        </div>
        <AlertCircle size={14} strokeWidth={1.5} className="text-drift" />
      </div>
    );
  }

  const empty = valueMm === null;
  const sign = empty ? "" : valueMm! >= 0 ? "+" : "";
  const display = empty ? "—" : `${sign}${valueMm!.toFixed(1)}`;
  const direction =
    !empty && directionLabels
      ? valueMm! >= 0
        ? directionLabels.positive
        : directionLabels.negative
      : null;

  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <div>
        <p
          className={
            "text-[14px] " +
            (muted ? "text-ink-secondary" : "text-ink-primary")
          }
        >
          {label}
        </p>
        {direction ? (
          <p className="text-[11px] text-ink-tertiary">{direction}</p>
        ) : null}
      </div>
      <div className="flex flex-col items-end gap-0.5">
        <div className="flex items-baseline gap-1">
          <span
            className={"font-mono text-[15px] " + (muted ? "opacity-70" : "")}
            style={{
              color: tone ? TONE_COLORS[tone] : "var(--color-ink-tertiary)",
            }}
          >
            {display}
          </span>
          <span className="text-[11px] text-ink-tertiary">mm</span>
        </div>
        {std !== null && !empty ? (
          <span className="text-[10px] text-ink-tertiary font-mono">
            ± {std.toFixed(1)} mm
          </span>
        ) : null}
      </div>
    </div>
  );
}

function scoreColor(score: number) {
  if (score >= 80) return "#6b9077";
  if (score >= 55) return "#c98870";
  return "#b27460";
}

function toneRange(t: AlignmentTone): string {
  if (t === "within") return "< 5 mm";
  if (t === "monitor") return "5–15 mm";
  return "> 15 mm";
}
