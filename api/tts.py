"""
Vercel Python serverless function for text-to-speech.

Uses edge-tts (Microsoft Edge online voices) — free, no API key required.
Lives at the project root /api/ so Vercel detects it as a Python function
served at /api/tts (separate from the Next.js App Router).

Locally, `next dev` does NOT run Python. The browser falls back to
SpeechSynthesis when this endpoint is unreachable (see lib/tts.ts).
"""

from http.server import BaseHTTPRequestHandler
import edge_tts
import asyncio
import json
import io


DEFAULT_VOICE = "en-US-AriaNeural"  # warm female voice
DEFAULT_RATE = "-5%"  # slightly slower than default
MAX_TEXT_LEN = 2000


def _bad_request(handler: BaseHTTPRequestHandler, message: str, status: int = 400):
    body = json.dumps({"error": message}).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            content_length = int(self.headers.get("Content-Length", "0"))
            if content_length <= 0:
                return _bad_request(self, "Empty request body")
            raw = self.rfile.read(content_length)
            try:
                body = json.loads(raw)
            except json.JSONDecodeError:
                return _bad_request(self, "Invalid JSON body")

            text = (body.get("text") or "").strip()
            if not text:
                return _bad_request(self, "`text` is required")
            if len(text) > MAX_TEXT_LEN:
                return _bad_request(
                    self, f"`text` too long (max {MAX_TEXT_LEN} chars)", 413
                )

            voice = body.get("voice") or DEFAULT_VOICE
            rate = body.get("rate") or DEFAULT_RATE

            async def generate() -> bytes:
                communicate = edge_tts.Communicate(text, voice, rate=rate)
                audio = io.BytesIO()
                async for chunk in communicate.stream():
                    if chunk["type"] == "audio":
                        audio.write(chunk["data"])
                return audio.getvalue()

            audio_bytes = asyncio.run(generate())
            if not audio_bytes:
                return _bad_request(self, "No audio generated", 502)

            self.send_response(200)
            self.send_header("Content-Type", "audio/mpeg")
            self.send_header("Content-Length", str(len(audio_bytes)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(audio_bytes)
        except Exception as exc:  # noqa: BLE001 — surface clear error to client
            _bad_request(self, f"TTS failed: {exc}", 500)
