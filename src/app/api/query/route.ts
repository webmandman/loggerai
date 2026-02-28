import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { queryLogs } from "@/lib/ai";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { question } = body;

  if (!question || typeof question !== "string" || !question.trim()) {
    return NextResponse.json(
      { error: "question is required" },
      { status: 400 }
    );
  }

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

  const result = await queryLogs(question.trim(), entries);

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
    answer: result.answer,
    entries: serializedEntries,
  });
}
