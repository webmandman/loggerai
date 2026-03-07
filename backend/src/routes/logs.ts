import { Hono } from "hono";
import { prisma } from "../lib/db.js";
import { processLogEntry } from "../lib/ai.js";
import { normalizeActionItems, parseLocalDate, serializeEntry } from "../lib/utils.js";

const app = new Hono();

// GET /logs
app.get("/", async (c) => {
  const category = c.req.query("category");
  const tag = c.req.query("tag");
  const from = c.req.query("from");
  const to = c.req.query("to");
  const limit = parseInt(c.req.query("limit") || "50", 10);
  const offset = parseInt(c.req.query("offset") || "0", 10);

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

  const serialized = entries.map(serializeEntry);

  return c.json(
    { entries: serialized, total },
    200,
    { "Cache-Control": "no-store, max-age=0" }
  );
});

// POST /logs
app.post("/", async (c) => {
  const { rawInput, inputMethod } = await c.req.json();

  if (!rawInput || typeof rawInput !== "string" || !rawInput.trim()) {
    return c.json({ error: "rawInput is required" }, 400);
  }

  let processed;
  try {
    processed = await processLogEntry(rawInput.trim());
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
      rawInput: rawInput.trim(),
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

  return c.json(serializeEntry(entry), 201);
});

// DELETE /logs/:id
app.delete("/:id", async (c) => {
  const id = c.req.param("id");

  const entry = await prisma.logEntry.findUnique({ where: { id } });
  if (!entry) {
    return c.json({ error: "Entry not found" }, 404);
  }

  await prisma.logEntry.delete({ where: { id } });

  return c.json({ success: true });
});

// PATCH /logs/:id
app.patch("/:id", async (c) => {
  const id = c.req.param("id");
  const { summary } = await c.req.json();

  if (typeof summary !== "string" || !summary.trim()) {
    return c.json({ error: "summary (string) is required" }, 400);
  }

  const entry = await prisma.logEntry.findUnique({ where: { id } });
  if (!entry) {
    return c.json({ error: "Entry not found" }, 404);
  }

  const updated = await prisma.logEntry.update({
    where: { id },
    data: { summary: summary.trim() },
  });

  return c.json({ summary: updated.summary });
});

// PATCH /logs/:id/action-items
app.patch("/:id/action-items", async (c) => {
  const id = c.req.param("id");
  const { index, done } = await c.req.json();

  if (typeof index !== "number" || typeof done !== "boolean") {
    return c.json({ error: "index (number) and done (boolean) are required" }, 400);
  }

  const entry = await prisma.logEntry.findUnique({ where: { id } });
  if (!entry) {
    return c.json({ error: "Entry not found" }, 404);
  }

  const actionItems = normalizeActionItems(JSON.parse(entry.actionItems));

  if (index < 0 || index >= actionItems.length) {
    return c.json({ error: "Index out of bounds" }, 400);
  }

  actionItems[index] = { ...actionItems[index], done };

  await prisma.logEntry.update({
    where: { id },
    data: { actionItems: JSON.stringify(actionItems) },
  });

  return c.json({ actionItems });
});

export default app;
