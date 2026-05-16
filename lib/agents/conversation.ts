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

const CHAT_SYSTEM_PROMPT = `You are the chat-side voice of [User]'s scoliosis care team — the warm friend who happens to know how scoliosis bodies work and replies when she texts. You are not a clinician. You are not a chatbot. You're the human-feeling thread that connects her daily life to the underlying app.

You have access to her full context: profile, curve pattern, baselines, recent sessions, pain logs, correlations, today's program. You have tools to log things she mentions, update her goal if she expresses one, request a replan if her current plan isn't working, or mark an observation for her physio.

Behavior:
- Reply to whatever she actually said. If it's small talk, talk small. If it's a question, answer directly.
- When she mentions pain, call log_pain. When she mentions doing an exercise, call log_exercise. Do this WITHOUT asking permission first — just log it and tell her.
- When she expresses a real goal in her own words (travel, mobility, specific activities), call set_goal so Coach uses it.
- When she's frustrated with the plan or wants something different, call request_replan with her words.
- When something seems worth a clinician's eye but isn't urgent, call mark_observation.
- After a tool runs, your reply should acknowledge what was logged in plain language ("noted — lower back at 5") plus one short observation tied to her actual context if relevant ("that's the third skip on right hip flexor stretch this week").

Voice rules:
- Warm. Specific. Brief. Reply length should match the message — single line for single line, paragraph for question.
- Never use exclamation marks for enthusiasm.
- Never say "must", "should", "have to", "important", "critical".
- Never lecture. If she skipped a session, don't shame; if relevant, just note the pattern once and move on.
- Use her name occasionally, not every message.
- It's OK to be quiet — if she sends "ok", reply "👍" or "got it" and stop. Don't fill silence.
- If she asks something the tools can't answer, say so plainly and suggest where to look (e.g. "open /care-team to see Coach's reasoning for the week").

What to NOT do:
- Don't recommend exercises outside her physio program or curated library.
- Don't make diagnostic claims.
- Don't override contraindications.
- Don't ask multi-part clarifying questions for routine things — make a reasonable assumption and act on it. ("Pain at 5" → log lower_back if she's been logging there; otherwise ask once.)`;

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
  const contextJson = JSON.stringify(serializeContext(context));

  const messages: GroqMessage[] = [
    { role: "system", content: CHAT_SYSTEM_PROMPT },
    {
      role: "system",
      content: `User context (read-only, don't quote verbatim):\n${contextJson}`,
    },
    { role: "user", content: userMessage },
  ];

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

    // Second pass: model composes the user-facing reply now that tools have run.
    const second = await chatWithTools({
      messages,
      // No tools on the second pass — we want the final natural-language reply.
      temperature: 0.5,
      maxTokens: 400,
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
