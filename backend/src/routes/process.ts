import { Hono } from "hono";
import { prisma } from "../lib/db.js";
import { classifyIntent, processLogEntry } from "../lib/ai.js";
import { normalizeActionItems, parseLocalDate, serializeEntry } from "../lib/utils.js";

const app = new Hono();

app.post("/", async (c) => {
  const { rawInput, inputMethod } = await c.req.json();

  if (!rawInput || typeof rawInput !== "string" || !rawInput.trim()) {
    return c.json({ error: "rawInput is required" }, 400);
  }

  const trimmed = rawInput.trim();

  let intent: "log" | "query";
  try {
    intent = await classifyIntent(trimmed);
  } catch {
    return c.json({ error: "Failed to classify intent. Please try again." }, 500);
  }

  if (intent === "query") {
    return c.json({ type: "query_stream" });
  }

  let processed;
  try {
    processed = await processLogEntry(trimmed);
  } catch (err) {
    const message = err instanceof Error ? err.message : "AI processing failed";

    if (message.includes("401") || message.includes("authentication")) {
      return c.json({ error: "Invalid Anthropic API key. Check ANTHROPIC_API_KEY in your .env file." }, 401);
    }
    if (message.includes("429") || message.includes("rate")) {
      return c.json({ error: "Anthropic rate limit hit. Wait a moment and try again." }, 429);
    }
    return c.json({ error: `AI processing failed: ${message}` }, 500);
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

  return c.json(
    {
      type: "log",
      entry: serializeEntry(entry),
    },
    201
  );
});

export default app;
