import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { classifyIntent, processLogEntry, queryLogs } from "@/lib/ai";

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
    try {
      const entries = await prisma.logEntry.findMany({
        orderBy: { createdAt: "desc" },
        take: 100,
        select: {
          id: true,
          rawInput: true,
          summary: true,
          category: true,
          tags: true,
          actionItems: true,
          createdAt: true,
        },
      });

      const result = await queryLogs(trimmed, entries);

      const relevantEntries = result.relevantEntryIds.length
        ? await prisma.logEntry.findMany({
            where: { id: { in: result.relevantEntryIds } },
            orderBy: { createdAt: "desc" },
          })
        : [];

      const serializedEntries = relevantEntries.map((entry) => ({
        ...entry,
        tags: JSON.parse(entry.tags),
        actionItems: JSON.parse(entry.actionItems),
        createdAt: entry.createdAt.toISOString(),
        updatedAt: entry.updatedAt.toISOString(),
      }));

      return NextResponse.json({
        type: "query",
        answer: result.answer,
        entries: serializedEntries,
      });
    } catch (err) {
      console.error("Query failed:", err);
      return NextResponse.json(
        { error: "Query processing failed. Please try again." },
        { status: 500 }
      );
    }
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

  const entry = await prisma.logEntry.create({
    data: {
      rawInput: trimmed,
      summary: processed.summary,
      category: processed.category,
      tags: JSON.stringify(processed.tags),
      actionItems: JSON.stringify(processed.actionItems),
      mood: processed.mood,
      inputMethod: inputMethod || "text",
    },
  });

  return NextResponse.json(
    {
      type: "log",
      entry: {
        ...entry,
        tags: JSON.parse(entry.tags),
        actionItems: JSON.parse(entry.actionItems),
        createdAt: entry.createdAt.toISOString(),
        updatedAt: entry.updatedAt.toISOString(),
      },
    },
    { status: 201 }
  );
}
