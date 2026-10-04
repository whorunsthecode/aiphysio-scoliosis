// What a person is told when something fails, and where the details go.
//
// A person reading "Groq API 429: {"error":{"message":"Rate limit…"}}" learns
// nothing they can act on, and learns which vendors the app uses and how it
// is built. They get a plain sentence that says what happened to their data
// and what to do. The details go to the server log, where someone fixing it
// can read them.

export type FailureKind = "xray" | "parse" | "agent" | "chat" | "save";

export const NETWORK_ERROR =
  "Couldn't reach Balance. Check your connection and try again.";

const BUSY = "The service that does this is busy right now. Try again in a minute.";

export function publicError(kind: FailureKind, status?: number): string {
  if (status === 401 || status === 403) {
    return "You need to be signed in as this profile's owner to do that.";
  }
  if (status === 429) return BUSY;

  switch (kind) {
    case "xray":
      if (status === 503) return "X-ray reading isn't available right now. You can skip this step and add your curve details by hand.";
      if (status === 504) return "Reading the X-ray took too long. Try again, or skip this step.";
      if (status === 413) return "That image is too large. Use one under 10 MB.";
      if (status === 415) return "That file type isn't supported. Use a JPG, PNG or WEBP image.";
      if (status === 400) return "That file couldn't be read. Try a JPG, PNG or WEBP image.";
      return "I couldn't read this image. Try again, or skip this step.";
    case "parse":
      if (status === 503) return "Reading programme notes isn't available right now. You can skip this step and add your programme later.";
      if (status === 504) return "Reading your notes took too long. Try again, or skip this step.";
      if (status === 400) return "Paste some programme notes first.";
      return "I couldn't read those notes. Try again, or skip this step.";
    case "agent":
      if (status === 503) return "This isn't set up on the server yet.";
      if (status === 504) return "That run took too long and didn't finish. Nothing was saved. Try again in a minute.";
      return "That run didn't finish, and nothing was saved. Try again in a minute.";
    case "chat":
      return "I couldn't reply just now; something went wrong on my side. Slash commands still work, so try /help.";
    case "save":
      return "I couldn't save that just now. Nothing was changed. Try again in a minute.";
  }
}

// The details, for whoever has to fix it. Never sent to the person.
export function logFailure(where: string, e: unknown, extra?: Record<string, unknown>): void {
  const detail =
    e instanceof Error ? { name: e.name, message: e.message, status: (e as { status?: number }).status } : { value: e };
  console.error(`[${where}]`, { ...detail, ...extra });
}

// Status code a provider error carries, if any (GroqError / GeminiError).
export function statusOf(e: unknown): number | undefined {
  const s = (e as { status?: unknown } | null)?.status;
  return typeof s === "number" ? s : undefined;
}
