// Telegram bot client. One bot serves all three agents. Used both for
// outbound notifications (Coach summaries, Companion nudges, Liaison handoff
// docs) and the inbound webhook (slash commands).

const TELEGRAM_API = "https://api.telegram.org";

function getCreds() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    return { ok: false as const, error: "TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set" };
  }
  return { ok: true as const, token, chatId };
}

export type SendResult =
  | { ok: true; messageId: number }
  | { ok: false; error: string };

export async function sendTelegramMessage(
  text: string,
  options?: { chatId?: string; parseMode?: "Markdown" | "MarkdownV2" | "HTML" },
): Promise<SendResult> {
  const creds = getCreds();
  if (!creds.ok) return { ok: false, error: creds.error };

  const res = await fetch(`${TELEGRAM_API}/bot${creds.token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: options?.chatId ?? creds.chatId,
      text,
      parse_mode: options?.parseMode,
      disable_web_page_preview: true,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return { ok: false, error: `Telegram ${res.status}: ${body || res.statusText}` };
  }
  const json = (await res.json()) as { result?: { message_id: number } };
  return { ok: true, messageId: json.result?.message_id ?? 0 };
}

export async function sendTelegramDocument(
  fileBytes: Uint8Array,
  filename: string,
  caption?: string,
  options?: { chatId?: string },
): Promise<SendResult> {
  const creds = getCreds();
  if (!creds.ok) return { ok: false, error: creds.error };

  const form = new FormData();
  form.append("chat_id", options?.chatId ?? creds.chatId);
  if (caption) form.append("caption", caption);
  // Convert Uint8Array → Blob for FormData (Node 18+ has Blob globally).
  const blob = new Blob([new Uint8Array(fileBytes)], { type: "application/pdf" });
  form.append("document", blob, filename);

  const res = await fetch(`${TELEGRAM_API}/bot${creds.token}/sendDocument`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return { ok: false, error: `Telegram ${res.status}: ${body || res.statusText}` };
  }
  const json = (await res.json()) as { result?: { message_id: number } };
  return { ok: true, messageId: json.result?.message_id ?? 0 };
}

export type TelegramUpdate = {
  message?: {
    message_id: number;
    from: { id: number; username?: string };
    chat: { id: number };
    text?: string;
  };
};
