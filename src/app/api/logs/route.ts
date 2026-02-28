import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { processLogEntry } from "@/lib/ai";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const category = searchParams.get("category");
  const tag = searchParams.get("tag");
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const limit = parseInt(searchParams.get("limit") || "50", 10);
  const offset = parseInt(searchParams.get("offset") || "0", 10);

  const where: Record<string, unknown> = {};

  if (category) {
    where.category = category;
  }

  if (tag) {
    where.tags = { contains: tag };
  }

  if (from || to) {
    where.createdAt = {
      ...(from ? { gte: new Date(from) } : {}),
      ...(to ? { lte: new Date(to) } : {}),
    };
  }

  const [entries, total] = await Promise.all([
    prisma.logEntry.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    }),
    prisma.logEntry.count({ where }),
  ]);

  const serialized = entries.map((entry) => ({
    ...entry,
    tags: JSON.parse(entry.tags),
    actionItems: JSON.parse(entry.actionItems),
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
  }));

  return NextResponse.json({ entries: serialized, total });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { rawInput, inputMethod } = body;

  if (!rawInput || typeof rawInput !== "string" || !rawInput.trim()) {
    return NextResponse.json(
      { error: "rawInput is required" },
      { status: 400 }
    );
  }

  let processed;
  try {
    processed = await processLogEntry(rawInput.trim());
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "AI processing failed";

    if (message.includes("401") || message.includes("authentication")) {
      return NextResponse.json(
        { error: "Invalid Anthropic API key. Check ANTHROPIC_API_KEY in your .env file." },
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
      rawInput: rawInput.trim(),
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
      ...entry,
      tags: JSON.parse(entry.tags),
      actionItems: JSON.parse(entry.actionItems),
      createdAt: entry.createdAt.toISOString(),
      updatedAt: entry.updatedAt.toISOString(),
    },
    { status: 201 }
  );
}
