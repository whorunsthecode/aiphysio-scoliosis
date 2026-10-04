// What the Coach model is allowed to change, enforced in code.
//
// The model picks exercises and dose for the week and writes a short message.
// It does not get to decide which side anything is done on, invent
// exercises, or make claims about the curve. Those are checked here, after
// the model returns and before anything is stored or delivered:
//
//   1. Exercise ids not in the library are dropped.
//   2. Every side cue is overwritten from the library entry for the user's
//      curve pattern — every time, whatever the model wrote. When the side is
//      unknown the cue is blank, and side-dependent exercises are withheld
//      (handed over with no side, they are a coin flip on someone's spine).
//   3. The model's message is screened. Its schedule block is rebuilt from
//      the enforced programme; its prose is replaced with fixed text if it
//      names a side, mentions a withheld exercise, or makes a claim about the
//      curve.

import { getExerciseById } from "@/lib/exercises/library";
import { deriveCurvePattern, type ProfileLike } from "@/lib/exercises/profile";
import type { Exercise } from "@/lib/exercises/types";

export type CoachItem = { exercise_id: string; sets?: number; reps?: number; side_cue?: string };
export type CoachProgram = Record<string, CoachItem[]>;

export type DroppedItem = {
  day: string;
  exercise_id: string;
  reason: "not_in_library" | "side_unknown" | "no_cue_for_pattern";
};

export type EnforcedProgram = { program: CoachProgram; dropped: DroppedItem[]; sidesKnown: boolean };

const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;

function isSideDependent(e: Exercise): boolean {
  return Object.keys(e.asymmetric_cues ?? {}).some((k) => k !== "any");
}

function count(v: unknown, max: number): number | undefined {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isInteger(n) && n > 0 && n <= max ? n : undefined;
}

export function enforceCoachProgram(raw: unknown, profile: ProfileLike | null): EnforcedProgram {
  const pattern = profile ? deriveCurvePattern(profile) : "any";
  const known = pattern !== "any" && pattern !== "thoracolumbar";
  const program: CoachProgram = {};
  const dropped: DroppedItem[] = [];

  const source = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  for (const day of DAYS) {
    const items = Array.isArray(source[day]) ? (source[day] as unknown[]) : [];
    program[day] = [];
    for (const it of items) {
      const id = it && typeof it === "object" ? String((it as Record<string, unknown>).exercise_id ?? "") : "";
      const lib = id ? getExerciseById(id) : undefined;
      if (!lib) {
        dropped.push({ day, exercise_id: id || "(missing)", reason: "not_in_library" });
        continue;
      }
      const libCue = lib.asymmetric_cues[pattern] ?? lib.asymmetric_cues["any"] ?? null;
      if (isSideDependent(lib) && (!known || !libCue)) {
        dropped.push({ day, exercise_id: id, reason: known ? "no_cue_for_pattern" : "side_unknown" });
        continue;
      }
      const rec = it as Record<string, unknown>;
      const item: CoachItem = { exercise_id: id };
      const sets = count(rec.sets, 10);
      const reps = count(rec.reps, 50);
      if (sets) item.sets = sets;
      if (reps) item.reps = reps;
      // The model's side_cue is never kept. Library cue for this pattern,
      // or nothing.
      if (libCue) item.side_cue = libCue;
      program[day].push(item);
    }
  }
  return { program, dropped, sidesKnown: known };
}

// ───────────────────────────── message screen ─────────────────────────────

export type ScreenReason =
  | "empty"
  | "names_a_side"
  | "mentions_withheld_exercise"
  | "claim_about_the_curve";

export type ScreenedMessage = { message: string; reasons: ScreenReason[]; usedFallback: boolean };

// Claims the app must never make from webcam scans and adherence data.
const CURVE_CLAIM =
  /\b(cobb|diagnos\w*|cur(e|es|ed|ing)\b|revers\w* (your|the) curve|straighten\w* (your|the) (spine|curve|back)|(your|the) curve (is|has been|'s) (improving|getting (better|worse|straighter)|worsening|progressing|better|worse)|progression)\b/i;

const SIDE = /\b(left|right)\b/i;

const DAY_LABEL: Record<string, string> = {
  monday: "Mon", tuesday: "Tue", wednesday: "Wed", thursday: "Thu",
  friday: "Fri", saturday: "Sat", sunday: "Sun",
};

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// The schedule block, built from the enforced programme rather than the
// model's text, so it can only show what will actually be prescribed, with
// the library's side cue.
export function buildSchedule(program: CoachProgram): string {
  const lines: string[] = [];
  const sides = new Map<string, string>();
  for (const day of DAYS) {
    const items = program[day] ?? [];
    if (items.length === 0) {
      lines.push(`${DAY_LABEL[day]}  •  rest`);
      continue;
    }
    const names = items.map((i) => (getExerciseById(i.exercise_id)?.name ?? i.exercise_id).toLowerCase());
    const dose = items.find((i) => i.sets && i.reps);
    lines.push(`${DAY_LABEL[day]}  •  ${names.join(" · ")}${dose ? `   ${dose.sets}×${dose.reps}` : ""}`);
    for (const i of items) {
      if (i.side_cue) sides.set((getExerciseById(i.exercise_id)?.name ?? i.exercise_id).toLowerCase(), i.side_cue);
    }
  }
  const sideLines = [...sides].map(([n, c]) => `${n}: ${c}`);
  return `<pre>\n${escapeHtml([...lines, ...(sideLines.length ? ["", ...sideLines] : [])].join("\n"))}\n</pre>`;
}

export function screenCoachMessage(
  raw: unknown,
  enforced: EnforcedProgram,
): ScreenedMessage {
  const text = typeof raw === "string" ? raw : "";
  const schedule = buildSchedule(enforced.program);
  // The model's own schedule block is discarded; the screen applies to the
  // prose around it.
  const prose = text.replace(/<pre>[\s\S]*?<\/pre>/gi, "").trim();

  const reasons: ScreenReason[] = [];
  if (!prose) reasons.push("empty");
  if (SIDE.test(prose)) reasons.push("names_a_side");
  const withheldNames = enforced.dropped.flatMap((d) => {
    const lib = getExerciseById(d.exercise_id);
    return [d.exercise_id.replace(/_/g, " "), ...(lib ? [lib.name] : [])].map((n) => n.toLowerCase());
  });
  if (withheldNames.some((n) => n.length > 3 && prose.toLowerCase().includes(n))) {
    reasons.push("mentions_withheld_exercise");
  }
  if (CURVE_CLAIM.test(prose)) reasons.push("claim_about_the_curve");

  if (reasons.length === 0) {
    // Keep the model's layout: its first schedule block becomes the
    // enforced one, any others are removed.
    let first = true;
    const withSchedule = /<pre>[\s\S]*?<\/pre>/i.test(text)
      ? text.replace(/<pre>[\s\S]*?<\/pre>/gi, () => {
          if (!first) return "";
          first = false;
          return schedule;
        })
      : `${prose}\n\n${schedule}`;
    return { message: withSchedule.trim(), reasons, usedFallback: false };
  }

  // Fixed text. Says nothing the code has not checked.
  const fallback =
    "<b>Your plan for this week is ready.</b>\n\n" +
    `${schedule}\n\n` +
    "Each exercise's details are in the app.";
  return { message: fallback, reasons, usedFallback: true };
}
