// Tools the conversational chat handler can call. Each tool wraps a small
// Supabase write so the user's natural-language messages turn into real
// rows. Keep the parameter shapes simple — Groq's Llama-3.3 is good but
// not infinitely careful about JSON edge cases.

import { getServiceSupabase } from "@/lib/agents/server-supabase";
import { EXERCISE_LIBRARY } from "@/lib/exercises/library";
import type { GroqToolDef } from "@/lib/groq";

export const TOOL_DEFS: GroqToolDef[] = [
  {
    type: "function",
    function: {
      name: "log_pain",
      description:
        "Log a pain entry the user has just mentioned. Creates today's session if one doesn't exist; otherwise appends to it.",
      parameters: {
        type: "object",
        properties: {
          location: {
            type: "string",
            description: "Body region.",
            enum: [
              "neck",
              "left_shoulder",
              "right_shoulder",
              "upper_back",
              "mid_back",
              "lower_back",
              "left_hip",
              "right_hip",
            ],
          },
          intensity: {
            type: "integer",
            description: "Pain intensity 0-10. 0 is none, 10 is the worst it has ever been.",
            minimum: 0,
            maximum: 10,
          },
          type: {
            type: "string",
            description: "Quality of the pain.",
            enum: ["sharp", "dull", "ache", "tingling"],
          },
        },
        required: ["location", "intensity"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "log_exercise",
      description:
        "Log an exercise the user just completed. Use the library exercise_id when possible. Creates today's session if needed.",
      parameters: {
        type: "object",
        properties: {
          exercise_id: {
            type: "string",
            description:
              "Library ID for the exercise (e.g. 'hip_bridge_pelvic_press_down', 'side_plank_convex_thoracic_side_down', 'bird_dog_asymmetric_hold', 'hip_flexor_stretch_stiff_side'). Use the closest match if the user describes informally.",
          },
          sets: { type: "integer", description: "Sets completed.", minimum: 1 },
          reps_per_set: {
            type: "integer",
            description: "Reps per set if rep-based. Omit if hold-based.",
            minimum: 1,
          },
          hold_seconds: {
            type: "integer",
            description: "Hold seconds per set if hold-based. Omit if rep-based.",
            minimum: 1,
          },
        },
        required: ["exercise_id", "sets"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "set_goal",
      description:
        "Update the user's stated goal — what they actually want from this. Coach uses this in plan messages.",
      parameters: {
        type: "object",
        properties: {
          text: {
            type: "string",
            description:
              "User's goal in their own words. One sentence is fine.",
          },
        },
        required: ["text"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "request_replan",
      description:
        "Tell Coach to regenerate the week's plan because the current one isn't working. Reason should capture what the user said.",
      parameters: {
        type: "object",
        properties: {
          reason: {
            type: "string",
            description:
              "Short summary of why a replan is needed, in the user's voice.",
          },
        },
        required: ["reason"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "mark_observation",
      description:
        "Record an observation worth surfacing to the user's physio at their next appointment. Don't send anything — just log.",
      parameters: {
        type: "object",
        properties: {
          text: {
            type: "string",
            description: "Observation in clinical-friendly language.",
          },
          category: {
            type: "string",
            enum: ["pain_pattern", "adherence", "lifestyle", "concern"],
          },
        },
        required: ["text", "category"],
      },
    },
  },
];

export type ToolResult = { ok: boolean; summary?: string; error?: string };

export async function executeTool(
  profileId: string,
  name: string,
  argsJson: string,
): Promise<ToolResult> {
  let args: Record<string, unknown>;
  try {
    args = JSON.parse(argsJson || "{}");
  } catch {
    return { ok: false, error: "Tool args weren't valid JSON" };
  }

  switch (name) {
    case "log_pain":
      return await toolLogPain(profileId, args);
    case "log_exercise":
      return await toolLogExercise(profileId, args);
    case "set_goal":
      return await toolSetGoal(profileId, args);
    case "request_replan":
      return await toolRequestReplan(profileId, args);
    case "mark_observation":
      return await toolMarkObservation(profileId, args);
    default:
      return { ok: false, error: `Unknown tool: ${name}` };
  }
}

// ─── Today-session helpers ───────────────────────────────────────────

// Find a session row for today (started within last 12h). If none, create
// a stub row we can append pain / exercise data to. Returns the session id.
async function getOrCreateTodaySession(profileId: string): Promise<string> {
  const supabase = getServiceSupabase();
  const since = new Date(Date.now() - 12 * 3600 * 1000).toISOString();
  const { data: existing } = await supabase
    .from("sessions")
    .select("id")
    .eq("profile_id", profileId)
    .eq("source", "real")
    .gte("started_at", since)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing?.id) return existing.id;

  const { data: created, error } = await supabase
    .from("sessions")
    .insert({
      profile_id: profileId,
      started_at: new Date().toISOString(),
      pain_check: [],
      exercises_completed: [],
      source: "real",
    })
    .select("id")
    .single();
  if (error || !created) {
    throw new Error(error?.message ?? "Couldn't create session row");
  }
  return created.id;
}

async function appendToSessionField<T>(
  sessionId: string,
  field: "pain_check" | "exercises_completed",
  newItem: T,
): Promise<void> {
  const supabase = getServiceSupabase();
  const { data } = await supabase
    .from("sessions")
    .select(field)
    .eq("id", sessionId)
    .single();
  const arr = ((data as Record<string, unknown> | null)?.[field] as T[]) ?? [];
  await supabase
    .from("sessions")
    .update({ [field]: [...arr, newItem] })
    .eq("id", sessionId);
}

// ─── Tool impls ──────────────────────────────────────────────────────

async function toolLogPain(
  profileId: string,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const location = args.location as string;
  const intensity = args.intensity as number;
  const type = (args.type as string) ?? "ache";
  if (!location || typeof intensity !== "number") {
    return { ok: false, error: "log_pain needs location + intensity" };
  }
  try {
    const sessionId = await getOrCreateTodaySession(profileId);
    await appendToSessionField(sessionId, "pain_check", {
      id: crypto.randomUUID(),
      location,
      intensity,
      type,
    });
    return {
      ok: true,
      summary: `${location.replace("_", " ")} pain ${intensity}/10 (${type})`,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

async function toolLogExercise(
  profileId: string,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const id = args.exercise_id as string;
  const sets = args.sets as number;
  const reps = args.reps_per_set as number | undefined;
  const hold = args.hold_seconds as number | undefined;
  if (!id || typeof sets !== "number") {
    return { ok: false, error: "log_exercise needs exercise_id + sets" };
  }
  // Soft-validate the exercise exists in the library; if not, still log
  // it (the LLM might be using a custom name from a physio program).
  const ex = EXERCISE_LIBRARY.find((e) => e.id === id);
  try {
    const sessionId = await getOrCreateTodaySession(profileId);
    await appendToSessionField(sessionId, "exercises_completed", {
      exerciseId: id,
      setsCompleted: sets,
      details: [
        {
          repsCompleted: reps ?? 0,
          holdSeconds: hold ?? 0,
        },
      ],
    });
    const desc =
      ex?.name ?? id.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    const detail = reps
      ? `${sets}×${reps}`
      : hold
        ? `${sets}×${hold}s`
        : `${sets} sets`;
    return { ok: true, summary: `${desc} ${detail}` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

async function toolSetGoal(
  profileId: string,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const text = args.text as string;
  if (!text || typeof text !== "string") {
    return { ok: false, error: "set_goal needs text" };
  }
  const supabase = getServiceSupabase();
  const { error } = await supabase
    .from("profiles")
    .update({ goal_text: text, updated_at: new Date().toISOString() })
    .eq("id", profileId);
  if (error) return { ok: false, error: error.message };
  return { ok: true, summary: `goal updated` };
}

async function toolRequestReplan(
  profileId: string,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const reason = (args.reason as string) ?? "user-initiated via chat";
  const supabase = getServiceSupabase();
  const { error } = await supabase.from("agent_messages").insert({
    profile_id: profileId,
    from_agent: "user",
    to_agent: "coach",
    message_type: "replan_request",
    payload: { reason },
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, summary: "Coach will replan on next run" };
}

async function toolMarkObservation(
  profileId: string,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const text = args.text as string;
  const category = (args.category as string) ?? "concern";
  if (!text) return { ok: false, error: "mark_observation needs text" };
  const supabase = getServiceSupabase();
  const { error } = await supabase.from("agent_observations").insert({
    profile_id: profileId,
    observed_by_agent: "companion",
    observation_text: text,
    category,
    severity: "info",
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, summary: "logged for physio" };
}
