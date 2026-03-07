import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function GET() {
  try {
    const twoWeeksAgo = new Date();
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);

    const entries = await prisma.logEntry.findMany({
      where: { createdAt: { gte: twoWeeksAgo } },
      orderBy: { createdAt: "desc" },
    });

    if (entries.length < 5) {
      return NextResponse.json({ insights: null });
    }

    const context = entries
      .map((e) => {
        const meta = e.metadata || "{}";
        return `(${e.createdAt.toLocaleDateString()}) [${e.category}] ${e.summary} | mood: ${e.mood || "unknown"} | metadata: ${meta}`;
      })
      .join("\n");

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 256,
      messages: [
        {
          role: "user",
          content: `Given these personal journal entries from the last 2 weeks, surface 1-2 brief, specific, actionable insights or patterns. Be encouraging and conversational. Each insight should be one sentence. Return ONLY a JSON array of strings, e.g. ["insight 1", "insight 2"]. No markdown.\n\nEntries:\n${context}`,
        },
      ],
    });

    const text = message.content[0].type === "text" ? message.content[0].text : "[]";

    try {
      const insights = JSON.parse(text);
      return NextResponse.json({ insights: Array.isArray(insights) ? insights : null });
    } catch {
      return NextResponse.json({ insights: null });
    }
  } catch (err) {
    console.error("Insights error:", err);
    return NextResponse.json({ insights: null }, { status: 500 });
  }
}
