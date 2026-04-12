import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { queryLogsStreaming } from "@/lib/ai";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { question } = body;

  if (!question || typeof question !== "string" || !question.trim()) {
    return new Response(JSON.stringify({ error: "question is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
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
      metadata: true,
      createdAt: true,
    },
  });

  const stream = queryLogsStreaming(question.trim(), entries);

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
