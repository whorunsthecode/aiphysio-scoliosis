"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Camera,
  CameraOff,
  CheckCircle2,
  Loader2,
  Mic,
  Pause,
  Play,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Volume2,
  VolumeX,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Heading } from "@/components/ui/Heading";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { TagPill } from "@/components/ui/TagPill";
import { CoachOverlay } from "@/components/exercise/CoachOverlay";
import { speak } from "@/lib/tts";
import {
  VOICE_THROTTLE_MS,
  type FormCheck,
  type FormCheckEvent,
  type FormCheckState,
} from "@/lib/exercises/formCheck/types";
import {
  getFormCheck,
  hasFormCheck,
} from "@/lib/exercises/formCheck/factory";
import type { Exercise } from "@/lib/exercises/types";
import type { NormalizedLandmark } from "@/lib/pose/types";
import type { Side } from "@/lib/onboarding/types";

type Status =
  | "idle"
  | "loading_model"
  | "requesting_camera"
  | "ready_to_start"
  | "coaching"
  | "set_complete"
  | "all_sets_complete"
  | "paused"
  | "error";

interface ExerciseCoachProps {
  exercise: Exercise;
  // Side derived from the user's curve pattern (e.g., convex thoracic side
  // for side plank, convex lumbar side for hip bridge).
  configuredSide: Side | null;
  // Number of sets for this exercise (defaults to exercise.sets ?? 3).
  totalSets?: number;
  // Called when all sets are complete with a small summary.
  onComplete?: (summary: SessionSummary) => void;
}

export type SessionSummary = {
  exerciseId: string;
  setsCompleted: number;
  details: { repsCompleted: number; holdSeconds: number }[];
};

export function ExerciseCoach({
  exercise,
  configuredSide,
  totalSets,
  onComplete,
}: ExerciseCoachProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const rafRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const formCheckRef = useRef<FormCheck | null>(null);
  const lastSpokenAtRef = useRef<number>(0);
  const sessionDetailsRef = useRef<SessionSummary["details"]>([]);

  const sets = totalSets ?? exercise.sets ?? 3;

  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [landmarks, setLandmarks] = useState<NormalizedLandmark[] | null>(
    null,
  );
  const [coachState, setCoachState] = useState<FormCheckState | null>(null);
  const [setIndex, setSetIndex] = useState<number>(1);
  const [voiceOn, setVoiceOn] = useState<boolean>(true);
  const [boxSize, setBoxSize] = useState<{ w: number; h: number }>({
    w: 640,
    h: 480,
  });
  const [lastSpokenPhrase, setLastSpokenPhrase] = useState<string | null>(null);

  const supportsFormCheck = hasFormCheck(exercise.id);

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

  useEffect(() => () => stopStream(), [stopStream]);

  const trySpeak = useCallback(
    (text: string, force = false) => {
      if (!voiceOn) return;
      const now = performance.now();
      if (!force && now - lastSpokenAtRef.current < VOICE_THROTTLE_MS) return;
      lastSpokenAtRef.current = now;
      setLastSpokenPhrase(text);
      void speak({ text }).done;
    },
    [voiceOn],
  );

  const handleEvents = useCallback(
    (events: FormCheckEvent[]) => {
      // Voice scheduler: collect all `compensation` events this frame and
      // pick the highest severity to speak (max one per VOICE_THROTTLE_MS).
      let bestComp: FormCheckEvent | null = null;
      for (const ev of events) {
        if (ev.type !== "compensation") continue;
        if (!bestComp) {
          bestComp = ev;
          continue;
        }
        if (
          (bestComp.type !== "compensation" || bestComp.severity === "minor") &&
          ev.severity === "major"
        ) {
          bestComp = ev;
        }
      }
      if (bestComp && bestComp.type === "compensation") {
        trySpeak(bestComp.phrase);
      }

      for (const ev of events) {
        if (ev.type === "rep_completed") {
          // Quiet acknowledge every other rep so it doesn't get noisy.
          if (ev.rep % 2 === 0) trySpeak(`${ev.rep}`, true);
        } else if (ev.type === "form_excellent") {
          trySpeak("Beautiful — hold that.");
        } else if (ev.type === "set_complete") {
          trySpeak("Set complete. Take a breath.", true);
        } else if (ev.type === "hold_lost") {
          trySpeak("I lost you — settle back in when you're ready.", true);
        }
      }
    },
    [trySpeak],
  );

  const startCoaching = async () => {
    setErrorMsg(null);
    setStatus("loading_model");
    try {
      // MediaPipe is the form-check model (latency-critical).
      const { getPoseLandmarker } = await import("@/lib/pose/landmarker");
      const landmarker = await getPoseLandmarker("full");

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

      // Init the form check for this exercise + configured side.
      const fc = getFormCheck(exercise.id);
      if (!fc) {
        // Render the static-cues fallback path; we still want camera + skeleton viz.
        formCheckRef.current = null;
      } else {
        if (configuredSide) fc.configureSide(configuredSide);
        fc.resetForNewSet();
        formCheckRef.current = fc;
      }

      setStatus("ready_to_start");

      const tick = () => {
        const v = videoRef.current;
        if (!v || v.readyState < 2) {
          rafRef.current = requestAnimationFrame(tick);
          return;
        }
        const ts = performance.now();
        try {
          const result = landmarker.detectForVideo(v, ts);
          const lms = (result.landmarks?.[0] ?? null) as
            | NormalizedLandmark[]
            | null;
          setLandmarks(lms);

          if (formCheckRef.current && lms) {
            const events = formCheckRef.current.process(lms, ts);
            if (events.length > 0) handleEvents(events);
            setCoachState(formCheckRef.current.getState());
          }
        } catch {
          // ignore individual frame errors
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      setErrorMsg(
        msg.includes("Permission") || msg.includes("NotAllowed")
          ? "Camera permission was denied. Allow camera access in your browser to coach you."
          : msg.includes("NotFound")
            ? "I couldn't find a camera on this device."
            : msg,
      );
      setStatus("error");
      stopStream();
    }
  };

  const beginSet = () => {
    if (formCheckRef.current) formCheckRef.current.resetForNewSet();
    lastSpokenAtRef.current = 0;
    setStatus("coaching");
    if (exercise.id === "side_plank_convex_thoracic_side_down") {
      trySpeak(
        `Set ${setIndex} of ${sets}. ${configuredSide ?? "right"} side down. Lift up when you're ready.`,
        true,
      );
    } else if (exercise.id === "hip_bridge_pelvic_press_down") {
      trySpeak(
        `Set ${setIndex} of ${sets}. Press your ${configuredSide ?? "left"} hip down on each lift.`,
        true,
      );
    } else if (exercise.id === "bird_dog_asymmetric_hold") {
      const armSide = configuredSide ?? "left";
      const legSide = armSide === "left" ? "right" : "left";
      trySpeak(
        `Set ${setIndex} of ${sets}. Longer hold on the ${armSide} arm and ${legSide} leg.`,
        true,
      );
    } else if (exercise.id === "lunge_pelvic_tilt_back_leg_tiptoe") {
      trySpeak(
        `Set ${setIndex} of ${sets}. Back leg up on tip-toe. Front knee soft, glutes drive you up.`,
        true,
      );
    } else if (exercise.id === "t_stretch_neutral_spine") {
      trySpeak(
        `Set ${setIndex} of ${sets}. Reach long, hips square, back leg straight.`,
        true,
      );
    } else {
      trySpeak(`Set ${setIndex} of ${sets}. Begin when you're ready.`, true);
    }
  };

  // Watch for set completion → push detail, advance set or finish.
  useEffect(() => {
    if (status !== "coaching" || !coachState?.setComplete) return;
    sessionDetailsRef.current.push({
      repsCompleted: coachState.repsCompleted,
      holdSeconds: coachState.holdSeconds,
    });
    if (setIndex >= sets) {
      setStatus("all_sets_complete");
      onComplete?.({
        exerciseId: exercise.id,
        setsCompleted: sets,
        details: sessionDetailsRef.current,
      });
      stopStream();
    } else {
      setStatus("set_complete");
    }
  }, [status, coachState, setIndex, sets, exercise.id, onComplete, stopStream]);

  const advanceToNextSet = () => {
    setSetIndex((i) => i + 1);
    setStatus("ready_to_start");
  };

  const reset = () => {
    sessionDetailsRef.current = [];
    setSetIndex(1);
    setCoachState(null);
    setLandmarks(null);
    setLastSpokenPhrase(null);
    setStatus("idle");
    setErrorMsg(null);
    stopStream();
    if (formCheckRef.current) formCheckRef.current.resetForNewSet();
  };

  // Sidebar derived data
  const inPosition = coachState?.inPosition ?? false;
  const goodForm =
    inPosition && (coachState?.activeCompensations?.length ?? 0) === 0;

  const showCanvas =
    status === "ready_to_start" ||
    status === "coaching" ||
    status === "paused" ||
    status === "set_complete";

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      {/* Video stage */}
      <div
        ref={containerRef}
        className="relative aspect-video w-full overflow-hidden rounded-card bg-ink-primary shadow-card"
      >
        <video
          ref={videoRef}
          className={
            "absolute inset-0 h-full w-full object-cover " +
            (showCanvas ? "scale-x-[-1]" : "opacity-0")
          }
          playsInline
          muted
        />
        {showCanvas && landmarks ? (
          <CoachOverlay
            landmarks={landmarks}
            exerciseId={exercise.id}
            configuredSide={configuredSide}
            inPosition={inPosition}
            goodForm={goodForm}
            width={boxSize.w}
            height={boxSize.h}
            mirror
          />
        ) : null}

        {/* Top-left: set indicator + voice toggle */}
        {showCanvas ? (
          <div className="absolute left-4 top-4 flex items-center gap-2">
            <span className="rounded-full bg-base/85 px-3 py-1.5 text-[12px] font-medium text-ink-primary backdrop-blur-sm">
              Set {setIndex} of {sets}
            </span>
            <button
              type="button"
              onClick={() => setVoiceOn((v) => !v)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-base/85 text-ink-secondary backdrop-blur-sm transition-colors hover:text-ink-primary"
              aria-label={voiceOn ? "Mute voice cues" : "Unmute voice cues"}
            >
              {voiceOn ? (
                <Volume2 size={15} strokeWidth={1.6} />
              ) : (
                <VolumeX size={15} strokeWidth={1.6} />
              )}
            </button>
          </div>
        ) : null}

        {/* Top-right: live counter / hold timer */}
        {status === "coaching" && coachState ? (
          <div className="absolute right-4 top-4 rounded-2xl bg-base/85 px-4 py-2.5 text-right backdrop-blur-sm">
            {formCheckRef.current?.mode === "reps" ? (
              <>
                <p className="font-display text-[26px] font-bold leading-none text-sage-dark font-numerals">
                  {coachState.repsCompleted}
                </p>
                <p className="text-[10px] uppercase tracking-[0.14em] text-ink-secondary">
                  of {coachState.targetReps} reps
                </p>
              </>
            ) : (
              <>
                <p className="font-display text-[26px] font-bold leading-none text-sage-dark font-numerals">
                  {coachState.holdSeconds}
                </p>
                <p className="text-[10px] uppercase tracking-[0.14em] text-ink-secondary">
                  of {coachState.targetHoldSeconds}s hold
                </p>
              </>
            )}
          </div>
        ) : null}

        {/* Bottom: voice phrase */}
        {status === "coaching" && lastSpokenPhrase ? (
          <div className="absolute bottom-5 left-1/2 -translate-x-1/2 max-w-md rounded-full bg-sage/90 px-5 py-2.5 text-center text-[14px] text-white shadow-card-lift">
            <span className="inline-flex items-center gap-2">
              <Mic size={14} strokeWidth={1.5} className="animate-soft-pulse" />
              {lastSpokenPhrase}
            </span>
          </div>
        ) : null}

        {/* Idle / ready / set-complete / completion / error overlays */}
        {!showCanvas ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-6 text-center">
            {status === "idle" ? (
              <CenterAction icon={<Camera size={26} strokeWidth={1.5} />}>
                <Button
                  variant="primary"
                  onClick={startCoaching}
                  leftIcon={<Camera size={18} strokeWidth={1.5} />}
                >
                  Start camera
                </Button>
                <p className="mt-3 text-[12px] text-base/80">
                  Allows webcam access · no video leaves your device
                </p>
              </CenterAction>
            ) : null}

            {status === "loading_model" || status === "requesting_camera" ? (
              <CenterAction
                icon={
                  <Loader2 size={26} strokeWidth={1.5} className="animate-spin" />
                }
              >
                <p className="text-[14px] text-base/85">
                  {status === "loading_model"
                    ? "Loading the pose model…"
                    : "Asking for camera access…"}
                </p>
              </CenterAction>
            ) : null}

            {status === "all_sets_complete" ? (
              <CenterAction
                icon={<CheckCircle2 size={26} strokeWidth={1.5} />}
              >
                <p className="text-[14px] text-base/85">
                  All {sets} sets done. Beautifully held.
                </p>
                <Button
                  variant="secondary"
                  onClick={reset}
                  leftIcon={<RefreshCw size={16} strokeWidth={1.5} />}
                >
                  Run it again
                </Button>
              </CenterAction>
            ) : null}

            {status === "error" && errorMsg ? (
              <CenterAction icon={<CameraOff size={26} strokeWidth={1.5} />}>
                <p className="max-w-md text-[14px] text-base/85">{errorMsg}</p>
                <Button variant="secondary" onClick={reset}>
                  Try again
                </Button>
              </CenterAction>
            ) : null}
          </div>
        ) : null}

        {status === "ready_to_start" ? (
          <div className="absolute bottom-5 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2">
            <Button
              variant="primary"
              onClick={beginSet}
              leftIcon={<Play size={18} strokeWidth={1.5} />}
            >
              Begin set {setIndex}
            </Button>
            <p className="text-[11px] text-base/75">
              {configuredSide
                ? exercise.id === "side_plank_convex_thoracic_side_down"
                  ? `${configuredSide} side down`
                  : exercise.id === "hip_bridge_pelvic_press_down"
                    ? `Press ${configuredSide} hip down on each lift`
                    : ""
                : ""}
            </p>
          </div>
        ) : null}

        {status === "set_complete" ? (
          <div className="absolute bottom-5 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 rounded-2xl bg-base/90 px-5 py-4 backdrop-blur-sm">
            <p className="font-display text-[18px] text-ink-primary">
              Set {setIndex} done
            </p>
            <Button
              variant="primary"
              onClick={advanceToNextSet}
              leftIcon={<Play size={16} strokeWidth={1.5} />}
            >
              Begin set {setIndex + 1}
            </Button>
          </div>
        ) : null}
      </div>

      {/* Sidebar */}
      <div className="space-y-4">
        <Card padding="md">
          <SectionLabel>This set</SectionLabel>
          <div className="mt-3 grid grid-cols-3 gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-[0.14em] text-ink-secondary/80">
                set
              </p>
              <p className="font-display text-[28px] font-bold text-ink-primary font-numerals">
                {setIndex}
                <span className="text-[14px] text-ink-tertiary"> / {sets}</span>
              </p>
            </div>
            {formCheckRef.current?.mode === "reps" ||
            exercise.reps != null ? (
              <div>
                <p className="text-[10px] uppercase tracking-[0.14em] text-ink-secondary/80">
                  reps
                </p>
                <p
                  className="font-display text-[28px] font-bold text-sage-dark font-numerals"
                  style={{
                    color: goodForm ? "#6b9077" : "#2d2520",
                  }}
                >
                  {coachState?.repsCompleted ?? 0}
                  <span className="text-[14px] text-ink-tertiary">
                    {" "}
                    / {exercise.reps ?? coachState?.targetReps ?? "?"}
                  </span>
                </p>
              </div>
            ) : null}
            {formCheckRef.current?.mode === "hold" ||
            exercise.duration_seconds != null ? (
              <div>
                <p className="text-[10px] uppercase tracking-[0.14em] text-ink-secondary/80">
                  hold
                </p>
                <p
                  className="font-display text-[28px] font-bold font-numerals"
                  style={{ color: goodForm ? "#6b9077" : "#2d2520" }}
                >
                  {coachState?.holdSeconds ?? 0}
                  <span className="text-[14px] text-ink-tertiary">
                    {" "}
                    / {exercise.duration_seconds ?? coachState?.targetHoldSeconds ?? "?"}s
                  </span>
                </p>
              </div>
            ) : null}
          </div>

          {coachState ? (
            <div className="mt-3 flex items-center gap-2 text-[12px]">
              {coachState.inPosition ? (
                goodForm ? (
                  <TagPill tone="sage">
                    <Sparkles size={11} strokeWidth={1.6} className="mr-1" />
                    holding form
                  </TagPill>
                ) : (
                  <TagPill tone="terracotta">cue active</TagPill>
                )
              ) : (
                <TagPill tone="neutral">find position</TagPill>
              )}
            </div>
          ) : null}
        </Card>

        {coachState && coachState.activeCompensations.length > 0 ? (
          <Card padding="md" tone="terracotta">
            <SectionLabel>Cues from me</SectionLabel>
            <ul className="mt-2 space-y-2">
              {coachState.activeCompensations.map((c) => (
                <li
                  key={c.id}
                  className="flex items-start gap-2 text-[14px] text-ink-primary"
                >
                  <ShieldAlert
                    size={14}
                    strokeWidth={1.6}
                    className="mt-0.5 shrink-0 text-terracotta-dark"
                  />
                  <span>{c.phrase}</span>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}

        <Card padding="md">
          <SectionLabel>What I&rsquo;m watching</SectionLabel>
          <ul className="mt-2 space-y-1.5 text-[13px] text-ink-secondary">
            {exercise.id === "side_plank_convex_thoracic_side_down" ? (
              <>
                <Watch>Hip lifted — no sag below the shoulder–ankle line</Watch>
                <Watch>Top shoulder back — no rolling forward</Watch>
                <Watch>Head neutral — chin level, long crown</Watch>
              </>
            ) : null}
            {exercise.id === "hip_bridge_pelvic_press_down" ? (
              <>
                <Watch>Even hips at the top — same height L &amp; R</Watch>
                <Watch>
                  Press the {configuredSide ?? "convex"} hip down into the floor
                </Watch>
                <Watch>Full lift — squeeze the glutes</Watch>
                <Watch>Knees stay hip-width — don&rsquo;t collapse in</Watch>
              </>
            ) : null}
            {exercise.id === "bird_dog_asymmetric_hold" ? (
              <>
                <Watch>
                  Hold longer on the {configuredSide ?? "concave"}-arm side
                </Watch>
                <Watch>No hip drop — keep both hips level</Watch>
                <Watch>Square shoulders to hips — no twist</Watch>
                <Watch>Neutral neck — chin tucked, long crown</Watch>
              </>
            ) : null}
            {exercise.id === "lunge_pelvic_tilt_back_leg_tiptoe" ? (
              <>
                <Watch>Front knee tracks over the ankle — no caving in</Watch>
                <Watch>Even pelvis at the bottom — no drop on either side</Watch>
                <Watch>
                  Back leg on tip-toe; the work&rsquo;s in the front-leg glute
                </Watch>
              </>
            ) : null}
            {exercise.id === "t_stretch_neutral_spine" ? (
              <>
                <Watch>Body horizontal — head, hips, back ankle in a line</Watch>
                <Watch>Hips square — both at the same height</Watch>
                <Watch>Back leg straight — long line behind you</Watch>
              </>
            ) : null}
          </ul>
          {!supportsFormCheck ? (
            <p className="mt-3 rounded-2xl bg-base px-3 py-2 text-[12px] text-ink-tertiary">
              Live form-check for this one is on the way. The skeleton is
              streaming so you can use it as a mirror.
            </p>
          ) : null}
        </Card>

        <Card padding="md" tone="muted">
          <SectionLabel>Setup</SectionLabel>
          <p className="mt-2 text-[13px] text-ink-secondary">
            {exercise.setup_instructions}
          </p>
          <p className="mt-2 text-[13px] text-ink-secondary">
            {exercise.execution_cues}
          </p>
        </Card>

        {status !== "idle" && status !== "error" ? (
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-1.5 px-2 py-1 text-[12px] text-ink-tertiary transition-colors hover:text-ink-primary"
          >
            <Pause size={12} strokeWidth={1.6} />
            End session
          </button>
        ) : null}
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

function Watch({ children }: { children: ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <span className="mt-1.5 inline-block h-1 w-1 shrink-0 rounded-full bg-sage" />
      <span>{children}</span>
    </li>
  );
}

// Re-exposed for typing in the route module (avoids importing the heavy file
// just to get the summary type).
export type { FormCheckEvent };

// Memoized factory if a parent ever wants to drop in a coach without setting
// up its own state. Currently unused.
export function useExerciseCoachSetup(exerciseId: string) {
  return useMemo(() => ({ supports: hasFormCheck(exerciseId) }), [exerciseId]);
}
