import { Hono } from "hono";
import { prisma } from "../lib/db.js";
import { normalizeActionItems } from "../lib/utils.js";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function getWeekBounds(): { start: Date; end: Date } {
  const now = new Date();
  const day = now.getDay();
  const diffToMonday = day === 0 ? 6 : day - 1;
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - diffToMonday, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 7);
  return { start, end };
}

const app = new Hono();

app.get("/", async (c) => {
  try {
    const { start, end } = getWeekBounds();

    const entries = await prisma.logEntry.findMany({
      where: { createdAt: { gte: start, lt: end } },
      orderBy: { createdAt: "desc" },
    });

    if (entries.length === 0) {
      return c.json({
        summary: null,
        stats: { entryCount: 0, categories: {}, totalExerciseMinutes: 0, actionItemsDone: 0, actionItemsTotal: 0 },
      });
    }

    const categoryCounts: Record<string, number> = {};
    let totalExerciseMinutes = 0;
    let actionItemsDone = 0;
    let actionItemsTotal = 0;
    const moods: string[] = [];

    for (const e of entries) {
      categoryCounts[e.category] = (categoryCounts[e.category] || 0) + 1;
      if (e.mood) moods.push(e.mood);

      const meta = JSON.parse(e.metadata || "{}");
      if (typeof meta.durationMinutes === "number") totalExerciseMinutes += meta.durationMinutes;

      const items = normalizeActionItems(JSON.parse(e.actionItems));
      actionItemsTotal += items.length;
      actionItemsDone += items.filter((i) => i.done).length;
    }

    const stats = {
      entryCount: entries.length,
      categories: categoryCounts,
      totalExerciseMinutes,
      actionItemsDone,
      actionItemsTotal,
    };

    const context = entries
      .map((e) => `(${e.createdAt.toLocaleDateString()}) [${e.category}] ${e.summary}`)
      .join("\n");

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 256,
      messages: [
        {
          role: "user",
          content: `Summarize this week's journal entries in 2-3 concise sentences. Focus on themes, accomplishments, and mood. Be conversational and encouraging.\n\nEntries:\n${context}`,
        },
      ],
    });

    const aiSummary = message.content[0].type === "text" ? message.content[0].text : null;

    return c.json({ summary: aiSummary, stats });
  } catch (err) {
    console.error("Digest error:", err);
    return c.json({ summary: null, stats: null }, 500);
  }
});

export default app;
