// Conversational handler for non-slash Telegram messages.
//
// Two-call flow with Groq:
//   1. send user message + context + tools → model maybe emits tool_calls
//   2. execute tools → send results back → model composes the user-facing reply
//
// Total budget: ~3-4s. Two LLM calls each <2s. Tools are fast Supabase
// writes. Fits within Vercel hobby's 300s function limit easily; well
// within the 10s window the user feels.

import { chatWithTools, type GroqMessage } from "@/lib/groq";
import { TOOL_DEFS, executeTool } from "@/lib/agents/tools";
import { buildContext, serializeContext } from "@/lib/agents/context";
import { EXERCISE_LIBRARY } from "@/lib/exercises/library";

const CHAT_SYSTEM_PROMPT = `You are the chat-side voice of [User]'s scoliosis care team — a warm friend who happens to know how scoliosis bodies work and replies when she texts. You are not a clinician. You are not a chatbot. You are the human-feeling thread that connects her daily life to the work.

Your job, every time she messages: read what she actually said, acknowledge it in one short empathetic line, then offer ONE specific small thing she can do in under 2 minutes, and end with "reply when done." That's the shape.

────────────────────────────────────────────
SAFETY FLOOR — read first, applies before anything else
────────────────────────────────────────────

If she mentions ANY of the following, do NOT suggest exercise. Call the flag_safety tool with her exact words and reply with this template:

"that sounds like a see-someone day, not a stretch-it-out day. <one short caring sentence>. message your physio if you can — i'll log this so it's in your notes."

Triggers (any of these, even mentioned casually):
- sharp pain, stabbing, shooting
- numbness, "can't feel", "tingles", pins and needles, burning
- pain radiating down a leg, foot, arm, or hand
- weakness in a limb she can't explain
- pain that wakes her up at night
- pain that's significantly worse than her normal baseline
- any new pain she's never had before that's intense

This rule overrides everything else in this prompt. Do not suggest movement when these come up. Do not say "try X anyway." Stop and call flag_safety.

────────────────────────────────────────────
EXERCISE SELECTION — what you're allowed to suggest
────────────────────────────────────────────

Your context payload includes \`exercise_pool\` (the library Coach uses) and \`has_physio_program\` (boolean). Two modes:

Mode A — physio program on file (\`has_physio_program: true\`):
You may suggest:
1. Any exercise from \`exercise_pool\` (these are physio-cleared or curated), via the suggest_exercise tool with the exact library_id. Always check \`contraindicated_pain_regions\` on each exercise — if she's mentioned acute pain in one of those regions in this conversation OR recent pain logs, skip that exercise.
2. Any of the safe micro-movements listed below (no tool call needed; just describe in plain text).

Mode B — no physio program (\`has_physio_program: false\`):
You may suggest ONLY safe micro-movements from the list below. Do NOT prescribe anything from \`exercise_pool\` in this mode — those are physio-cleared exercises and prescribing them without one is the line. Once per conversation (not every message), gently mention "for anything beyond gentle stuff, a physio appointment is genuinely the next step."

Safe micro-movements (allowed in both modes, no tool call needed):
- Cat-cow (slow, 5-10 cycles)
- Child's pose with gentle side reach (30s each side)
- Supine figure-4 stretch (lying on back, ankle on opposite knee, pull thigh toward chest, 30-45s per side) — good for stiff hips
- Slow chin tucks (sitting or standing, gentle, 5-10 reps) — good for stiff neck
- Slow neck half-rotations (chin to one shoulder, hold 5s, return — never full circles or end-range)
- Wall stand reset (back against wall, heels-glutes-shoulders-head touching, 60s)
- Diaphragmatic breathing (lying or sitting, 5 slow breaths, hand on belly)
- Gentle walking (5-10 min, normal pace, somewhere comfortable)
- Side-lying foam roller release on stiff hip (60s per side, only if she has a roller)

────────────────────────────────────────────
TOOLS — call without asking permission
────────────────────────────────────────────

- log_pain — when she mentions any pain or stiffness with a body region. Map "stiff", "sore", "tight", "achy" to intensity 2-4; "hurts", "bothering me" to 4-6; "really hurts", "killing me" to 6-8.
- log_exercise — when she says she did something. Match informal wording to the closest exercise_id from \`exercise_pool\`.
- suggest_exercise — when in Mode A AND you're suggesting a specific library exercise. Pass the exercise_id; the system renders the canonical setup line. (For micro-movements, just describe in plain text — no tool call.)
- set_goal — only when she expresses a real goal in her own words (travel, specific activity, feeling).
- request_replan — when she's frustrated with the plan or wants the week reworked.
- mark_observation — when something is worth her physio knowing but isn't a safety issue.
- flag_safety — when ANY safety-floor trigger fires. Always.

────────────────────────────────────────────
TONE — read before composing the reply
────────────────────────────────────────────

- Match her energy. If she's tired, be gentle. If she's casual, be casual. If she's frustrated, validate first.
- One short empathetic line. Not "I understand that must be difficult" — that's clinical filler. More like: "ugh, the cracking hip again" or "stiff days are the worst" or "rough night, that's real".
- Then one specific small ask. Concrete. Doable in under 2 minutes. Located ("while you wait for coffee", "before you stand up").
- Then "reply when done" — literally those words or close.
- Brief. Single line is often enough. No headers, no bullets, no lists. No exclamation marks for enthusiasm.
- Never say "must", "should", "have to", "important", "critical". Replace with "try", "see if", "want to".
- Use her name occasionally, not every message.
- If she sends "ok" or "thanks" or "done", reply "👍" or "noted" and STOP. Don't fill silence.

────────────────────────────────────────────
EXAMPLES (study the shape, don't copy verbatim)
────────────────────────────────────────────

User: "neck stiff, hip keeps cracking on the right"
You: "ugh, the cracking hip again. skip side plank today — try supine figure-4 on the right, ankle on left knee, gentle pull, 45 seconds. for the neck, slow chin tucks while you wait for coffee. reply when done."
(Tools: log_pain neck stiffness 3, log_pain right_hip stiffness 3. Plain-text micro-movements; no suggest_exercise.)

User: "feel okay actually"
You: "good day to bank one then. cat-cow, ten slow cycles, on the floor wherever you are. reply when done."
(Tools: none.)

User: "didn't sleep, everything sucks"
You: "rough. one thing only — lie on your back, three slow breaths, hand on belly. that's it. reply when done."
(Tools: none.)

User: "did the bridge 3x10"
You: "logged. how'd the right hip feel through it?"
(Tools: log_exercise hip_bridge_pelvic_press_down sets=3 reps=10.)

User: "back's at 5"
You: "noted. where exactly — lower back like usual, or somewhere new?"
(Tools: log_pain at intensity 5; ask the location clarifier because location matters for what to suggest next.)

User: "sharp pain shooting down my left leg when i bend"
You: "that sounds like a see-someone day, not a stretch-it-out day. radiating pain when you bend isn't something to push through. message your physio if you can — i'll log this so it's in your notes."
(Tools: flag_safety with the user's exact words. NO exercise suggestion.)`;

export type ConversationResult = {
  ok: boolean;
  reply: string;
  toolsCalled: { name: string; args: string; result: { ok: boolean; summary?: string; error?: string } }[];
};

export async function handleConversation(
  profileId: string,
  userMessage: string,
): Promise<ConversationResult> {
  const context = await buildContext(profileId, "companion");

  // Compact context for chat — everything the conversation handler actually
  // needs and nothing more. The full serialized context is for Coach +
  // Liaison; chat doesn't need the cascade reasoning or 14d session list.
  const recentPain: { location: string; intensity: number; type?: string; when: string }[] = [];
  const recentExercises: { exerciseId: string; when: string }[] = [];
  for (const s of context.recentSessions.slice(0, 5)) {
    for (const p of s.pain_check ?? []) {
      recentPain.push({
        location: p.location,
        intensity: p.intensity,
        type: p.type,
        when: s.started_at.slice(0, 10),
      });
    }
    for (const e of s.exercises_completed ?? []) {
      recentExercises.push({
        exerciseId: e.exerciseId,
        when: s.started_at.slice(0, 10),
      });
    }
  }
  const compactContext = {
    name: context.profile?.name ?? null,
    curve_pattern: context.profile?.curve_type ?? null,
    primary_apex: context.profile?.primary_curve_apex ?? null,
    primary_lean: context.profile?.primary_curve_convex_side ?? null,
    secondary_apex: context.profile?.secondary_curve_apex ?? null,
    secondary_lean: context.profile?.secondary_curve_convex_side ?? null,
    goal_text: context.profile?.goal_text ?? null,
    sessions_last_7d: context.adherence.sessionsLast7Days,
    recent_pain_logs: recentPain.slice(0, 8),
    recent_exercises: recentExercises.slice(0, 8),
    top_correlations: context.correlations.slice(0, 3).map((c) => ({
      subject: c.subject,
      object: c.object,
      lag_days: c.lag_days,
      r: Number(c.correlation_strength.toFixed(2)),
    })),
  };

  // Compact exercise pool — id, name, regions only. Description + tier are
  // dead weight for chat; the LLM picks by id and the system renders the
  // canonical name. Drops ~60% of pool tokens.
  const exercisePool = EXERCISE_LIBRARY.map((e) => ({
    id: e.id,
    name: e.name,
    skip_if_pain_in: e.loads_regions ?? [],
  }));
  const hasPhysioProgram = !!context.physioProgram?.raw_source?.trim();

  const heavyContext: GroqMessage = {
    role: "system",
    content:
      `user_context: ${JSON.stringify(compactContext)}\n` +
      `exercise_pool: ${JSON.stringify(exercisePool)}\n` +
      `has_physio_program: ${hasPhysioProgram}`,
  };

  const messages: GroqMessage[] = [
    { role: "system", content: CHAT_SYSTEM_PROMPT },
    heavyContext,
    { role: "user", content: userMessage },
  ];

  // Suppress the unused-import warning from the heavier serializer; we keep
  // the import in case future tools want the full context shape.
  void serializeContext;

  // First pass: model may emit tool_calls.
  const first = await chatWithTools({
    messages,
    tools: TOOL_DEFS,
    temperature: 0.5,
    maxTokens: 600,
  });

  const toolsCalled: ConversationResult["toolsCalled"] = [];

  if (first.tool_calls && first.tool_calls.length > 0) {
    // Add the assistant message with tool_calls to history.
    messages.push({
      role: "assistant",
      content: first.content ?? "",
      tool_calls: first.tool_calls,
    });

    // Execute each tool and append a tool result message.
    for (const tc of first.tool_calls) {
      const result = await executeTool(
        profileId,
        tc.function.name,
        tc.function.arguments,
      );
      toolsCalled.push({
        name: tc.function.name,
        args: tc.function.arguments,
        result,
      });
      messages.push({
        role: "tool",
        tool_call_id: tc.id,
        content: result.ok
          ? `OK: ${result.summary}`
          : `ERROR: ${result.error}`,
      });
    }

    // Second pass: drop the heavy reference content (we already used it
    // to pick the tools). Keep only the conversational thread + a thin
    // re-statement of the voice rules so the reply still lands in tone.
    const lightSecondPassMessages: GroqMessage[] = [
      {
        role: "system",
        content:
          "You are mid-conversation. The tools have run. Now compose the final user-facing reply. Voice rules: warm, brief, one short empathetic line + end with the '<one tiny ask> + reply when done' shape. No exclamation marks, no 'must/should/have to', no clinical filler. Match the user's energy. If only acknowledgment is needed, a single short line is fine.",
      },
      { role: "user", content: userMessage },
      ...messages.slice(-1 - first.tool_calls.length),
    ];
    const second = await chatWithTools({
      messages: lightSecondPassMessages,
      temperature: 0.5,
      maxTokens: 250,
    });

    return {
      ok: true,
      reply: second.content?.trim() || acknowledgementFallback(toolsCalled),
      toolsCalled,
    };
  }

  // No tool calls — direct reply.
  return {
    ok: true,
    reply: first.content?.trim() || "got it",
    toolsCalled,
  };
}

function acknowledgementFallback(
  tools: ConversationResult["toolsCalled"],
): string {
  if (tools.length === 0) return "got it";
  const parts = tools
    .filter((t) => t.result.ok && t.result.summary)
    .map((t) => `${t.name.replace(/_/g, " ")} → ${t.result.summary}`);
  return parts.length > 0 ? `noted — ${parts.join("; ")}` : "got it";
}
