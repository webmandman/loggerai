import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(request: NextRequest) {
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY is not configured" },
      { status: 500 }
    );
  }

  const formData = await request.formData();
  const audioFile = formData.get("audio") as File | null;

  if (!audioFile) {
    return NextResponse.json(
      { error: "No audio file provided" },
      { status: 400 }
    );
  }

  try {
    const transcription = await openai.audio.transcriptions.create({
      file: audioFile,
      model: "whisper-1",
      language: "en",
    });

    return NextResponse.json({ text: transcription.text });
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
      const message =
        messages[code] ?? `OpenAI error: ${err.message}`;

      return NextResponse.json({ error: message }, { status: err.status });
    }

    return NextResponse.json(
      { error: "Transcription failed unexpectedly." },
      { status: 500 }
    );
  }
}
