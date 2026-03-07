import { Hono } from "hono";
import { stream as honoStream } from "hono/streaming";
import { prisma } from "../lib/db.js";
import { queryLogs, queryLogsStreaming } from "../lib/ai.js";
import { normalizeActionItems, serializeEntry } from "../lib/utils.js";

const app = new Hono();

// POST /query
app.post("/", async (c) => {
  const { question } = await c.req.json();

  if (!question || typeof question !== "string" || !question.trim()) {
    return c.json({ error: "question is required" }, 400);
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

  const result = await queryLogs(question.trim(), entries);

  const relevantEntries = result.relevantEntryIds.length
    ? await prisma.logEntry.findMany({
        where: { id: { in: result.relevantEntryIds } },
        orderBy: { createdAt: "desc" },
      })
    : [];

  const serializedEntries = relevantEntries.map(serializeEntry);

  return c.json({
    answer: result.answer,
    entries: serializedEntries,
  });
});

// POST /query/stream
app.post("/stream", async (c) => {
  const { question } = await c.req.json();

  if (!question || typeof question !== "string" || !question.trim()) {
    return c.json({ error: "question is required" }, 400);
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

  const aiStream = queryLogsStreaming(question.trim(), entries);

  return new Response(aiStream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
});

export default app;
