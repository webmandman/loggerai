import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { classifyIntent, processLogEntry } from "@/lib/ai";
import { normalizeActionItems, parseLocalDate } from "@/lib/utils";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { rawInput, inputMethod } = body;

  if (!rawInput || typeof rawInput !== "string" || !rawInput.trim()) {
    return NextResponse.json(
      { error: "rawInput is required" },
      { status: 400 }
    );
  }

  const trimmed = rawInput.trim();

  let intent: "log" | "query";
  try {
    intent = await classifyIntent(trimmed);
  } catch {
    return NextResponse.json(
      { error: "Failed to classify intent. Please try again." },
      { status: 500 }
    );
  }

  if (intent === "query") {
    return NextResponse.json({ type: "query_stream" });
  }

  // intent === "log"
  let processed;
  try {
    processed = await processLogEntry(trimmed);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "AI processing failed";

    if (message.includes("401") || message.includes("authentication")) {
      return NextResponse.json(
        {
          error:
            "Invalid Anthropic API key. Check ANTHROPIC_API_KEY in your .env file.",
        },
        { status: 401 }
      );
    }
    if (message.includes("429") || message.includes("rate")) {
      return NextResponse.json(
        { error: "Anthropic rate limit hit. Wait a moment and try again." },
        { status: 429 }
      );
    }
    return NextResponse.json(
      { error: `AI processing failed: ${message}` },
      { status: 500 }
    );
  }

  const createdAt = processed.occurredAt ? parseLocalDate(processed.occurredAt) : undefined;

  const entry = await prisma.logEntry.create({
    data: {
      rawInput: trimmed,
      summary: processed.summary,
      category: processed.category,
      tags: JSON.stringify(processed.tags),
      actionItems: JSON.stringify(processed.actionItems),
      metadata: JSON.stringify(processed.metadata),
      mood: processed.mood,
      inputMethod: inputMethod || "text",
      ...(createdAt ? { createdAt } : {}),
    },
  });

  return NextResponse.json(
    {
      type: "log",
      entry: {
        ...entry,
        tags: JSON.parse(entry.tags),
        actionItems: normalizeActionItems(JSON.parse(entry.actionItems)),
        metadata: JSON.parse(entry.metadata || "{}"),
        createdAt: entry.createdAt.toISOString(),
        updatedAt: entry.updatedAt.toISOString(),
      },
    },
    { status: 201 }
  );
}
