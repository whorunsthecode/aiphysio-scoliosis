// Companion must not send the same nudge twice within 48 hours.
//
// This was a line in the prompt and nothing else, so it held only as often
// as the model remembered it. It is checked here, after the model decides to
// send and before anything is delivered. A repeat means the run defers and
// writes nothing.
//
// "The same" is judged on words, not characters: the stored copy has the
// user's name where the draft has {name}, and the model rarely repeats
// itself byte for byte.

export const NO_REPEAT_WINDOW_MS = 48 * 3600 * 1000;
export const REPEAT_SIMILARITY = 0.8;

// Filler that carries no meaning about what the nudge asks.
const FILLER = new Set(["the", "a", "an", "and", "or", "to", "of", "in", "on", "at", "it", "is", "was", "did", "do", "you", "your", "up", "end"]);

// Crude stemming: "happening", "happened" and "happen" are one word here.
function stem(w: string): string {
  return w.replace(/(ing|ed|es|s)$/, "") || w;
}

function words(text: string, name?: string | null): Set<string> {
  let t = text.toLowerCase().replace(/\{name\}/g, " ");
  if (name?.trim()) t = t.split(name.trim().toLowerCase()).join(" ");
  return new Set(
    t
      .replace(/<[^>]+>/g, " ")
      .replace(/[^a-z0-9\s']/g, " ") // hyphens too: "hip-flexor" is "hip flexor"
      .split(/\s+/)
      .filter((w) => w.length > 1 && !FILLER.has(w))
      .map(stem),
  );
}

export function similarity(a: string, b: string, name?: string | null): number {
  const A = words(a, name);
  const B = words(b, name);
  if (A.size === 0 && B.size === 0) return 1;
  let both = 0;
  for (const w of A) if (B.has(w)) both++;
  return both / (A.size + B.size - both);
}

export function isRepeatNudge(
  draft: string,
  recent: { message_text: string; sent_at: string }[],
  now: number,
  name?: string | null,
): boolean {
  return recent.some(
    (r) =>
      now - new Date(r.sent_at).getTime() <= NO_REPEAT_WINDOW_MS &&
      similarity(draft, r.message_text, name) >= REPEAT_SIMILARITY,
  );
}
