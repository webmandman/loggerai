import { Hono } from "hono";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const VALID_EXTENSIONS = new Set(["flac", "m4a", "mp3", "mp4", "mpeg", "mpga", "oga", "ogg", "wav", "webm"]);

function inferExtension(file: File): string {
  const fromName = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (VALID_EXTENSIONS.has(fromName)) return fromName;

  const typeMap: Record<string, string> = {
    "audio/webm": "webm",
    "audio/ogg": "ogg",
    "audio/mp4": "m4a",
    "audio/mpeg": "mp3",
    "audio/wav": "wav",
    "audio/flac": "flac",
    "audio/x-m4a": "m4a",
  };

  const base = file.type.split(";")[0].trim();
  return typeMap[base] || "webm";
}

const app = new Hono();

app.post("/", async (c) => {
  if (!process.env.OPENAI_API_KEY) {
    return c.json({ error: "OPENAI_API_KEY is not configured" }, 500);
  }

  const formData = await c.req.formData();
  const audioFile = formData.get("audio") as File | null;

  if (!audioFile) {
    return c.json({ error: "No audio file provided" }, 400);
  }

  const ext = inferExtension(audioFile);
  const properFile = new File([audioFile], `recording.${ext}`, {
    type: audioFile.type || `audio/${ext}`,
  });

  try {
    const transcription = await openai.audio.transcriptions.create({
      file: properFile,
      model: "whisper-1",
      language: "en",
    });

    return c.json({ text: transcription.text });
  } catch (err) {
    if (err instanceof OpenAI.APIError) {
      const messages: Record<string, string> = {
        insufficient_quota:
          "OpenAI API quota exceeded. Please add credits at platform.openai.com/account/billing.",
        invalid_api_key:
          "Invalid OpenAI API key. Check your OPENAI_API_KEY in .env.",
        rate_limit_exceeded:
          "Rate limit hit. Please wait a moment and try again.",
      };

      const code = (err as { code?: string }).code ?? "";
      const message = messages[code] ?? `OpenAI error: ${err.message}`;

      return c.json({ error: message }, err.status as 400);
    }

    return c.json({ error: "Transcription failed unexpectedly." }, 500);
  }
});

export default app;
