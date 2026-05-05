// Client-side TTS helper: tries the Vercel Python /api/tts endpoint first
// (edge-tts, high-quality voice). Falls back to the browser's SpeechSynthesis
// API when the endpoint is unreachable (e.g. local `next dev` which does not
// run Python functions). Returns a control object so callers can cancel.

export type SpeakOptions = {
  text: string;
  voice?: string;
  rate?: string;
  signal?: AbortSignal;
};

export type SpeakHandle = {
  done: Promise<"server" | "browser" | "skipped">;
  cancel: () => void;
};

let activeAudio: HTMLAudioElement | null = null;
let activeUtterance: SpeechSynthesisUtterance | null = null;

function cancelAll() {
  if (activeAudio) {
    activeAudio.pause();
    activeAudio.src = "";
    activeAudio = null;
  }
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    window.speechSynthesis.cancel();
    activeUtterance = null;
  }
}

export function speak({
  text,
  voice,
  rate,
  signal,
}: SpeakOptions): SpeakHandle {
  if (typeof window === "undefined") {
    return {
      done: Promise.resolve("skipped"),
      cancel: () => {},
    };
  }

  cancelAll();

  const ctrl = new AbortController();
  if (signal) {
    signal.addEventListener("abort", () => ctrl.abort(), { once: true });
  }

  const done = (async (): Promise<"server" | "browser" | "skipped"> => {
    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, voice, rate }),
        signal: ctrl.signal,
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        activeAudio = audio;
        try {
          await audio.play();
          await new Promise<void>((resolve) => {
            audio.onended = () => resolve();
            audio.onerror = () => resolve();
            ctrl.signal.addEventListener("abort", () => resolve(), {
              once: true,
            });
          });
        } finally {
          URL.revokeObjectURL(url);
          if (activeAudio === audio) activeAudio = null;
        }
        return "server";
      }
    } catch {
      // fall through to browser fallback
    }

    if (!("speechSynthesis" in window)) return "skipped";

    return new Promise<"browser">((resolve) => {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.95;
      utterance.pitch = 1.0;
      activeUtterance = utterance;
      utterance.onend = () => {
        activeUtterance = null;
        resolve("browser");
      };
      utterance.onerror = () => {
        activeUtterance = null;
        resolve("browser");
      };
      ctrl.signal.addEventListener(
        "abort",
        () => {
          window.speechSynthesis.cancel();
          activeUtterance = null;
          resolve("browser");
        },
        { once: true },
      );
      window.speechSynthesis.speak(utterance);
    });
  })();

  return {
    done,
    cancel: () => {
      ctrl.abort();
      cancelAll();
    },
  };
}
