import Anthropic from "@anthropic-ai/sdk";
import type { ProcessedLogEntry, QueryResult } from "@logger-ai/shared";
import { toLocalDateStr } from "@/lib/utils";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function classifyIntent(
  input: string
): Promise<"log" | "query"> {
  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 16,
    messages: [
      {
        role: "user",
        content: `Classify the following user input as either "log" or "query".

- "log": The user is recording a thought, note, task, event, or anything they want to save.
- "query": The user is asking a question about their past logs, searching, or requesting information.

Return ONLY the word "log" or "query", nothing else.

Input:
"""
${input}
"""`,
      },
    ],
  });

  const text =
    message.content[0].type === "text"
      ? message.content[0].text.trim().toLowerCase()
      : "";

  return text === "query" ? "query" : "log";
}

export async function processLogEntry(
  rawInput: string
): Promise<ProcessedLogEntry> {
  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: `You are an AI assistant that processes personal log entries. Today's date is ${toLocalDateStr()}. Analyze the following log entry and return a JSON object with these fields:

- "summary": A concise one-line summary (max 100 chars)
- "category": One of: task, idea, meeting, personal, note, reminder, bug, question, achievement, other
- "tags": An array of 1-5 relevant keyword tags (lowercase, no spaces)
- "actionItems": An array of action items or tasks extracted from the text (empty array if none)
- "mood": The detected mood/sentiment as a single word (e.g., "positive", "neutral", "frustrated", "excited", "anxious") or null if not discernible
- "occurredAt": If the entry refers to a specific date or relative time (e.g., "yesterday", "two days ago", "last Monday", "on Feb 15"), resolve it to an ISO 8601 date string (YYYY-MM-DD). If the entry uses "today" or has no date reference, return null.
- "metadata": A JSON object of structured key-value data extracted from the entry. Extract quantitative and categorical details useful for future queries and aggregation. Examples by category:
    Exercise/fitness: activityType, durationMinutes, distanceKm, location, intensity, physicalNotes
    Meeting: attendees, decisions, followups, project
    Task/work: project, estimatedHours, priority, blockers
    Food/health: meal, calories, ingredients, symptoms
  Only include keys that are clearly present or inferable from the text. Use null for mentioned-but-unknown values. Return {} if no structured data can be extracted.

Return ONLY valid JSON, no markdown formatting or code blocks.

Log entry:
"""
${rawInput}
"""`,
      },
    ],
  });

  const text =
    message.content[0].type === "text" ? message.content[0].text : "";

  try {
    const parsed = JSON.parse(text);
    return {
      summary: parsed.summary || rawInput.slice(0, 100),
      category: parsed.category || "note",
      tags: Array.isArray(parsed.tags) ? parsed.tags : [],
      actionItems: Array.isArray(parsed.actionItems)
        ? parsed.actionItems.map((item: unknown) =>
            typeof item === "string" ? { text: item, done: false } : item
          )
        : [],
      mood: parsed.mood || null,
      metadata:
        parsed.metadata && typeof parsed.metadata === "object" && !Array.isArray(parsed.metadata)
          ? parsed.metadata
          : {},
      occurredAt: typeof parsed.occurredAt === "string" ? parsed.occurredAt : null,
    };
  } catch {
    return {
      summary: rawInput.slice(0, 100),
      category: "note",
      tags: [],
      actionItems: [],
      mood: null,
      metadata: {},
      occurredAt: null,
    };
  }
}

export async function queryLogs(
  question: string,
  entries: Array<{
    id: string;
    rawInput: string;
    summary: string;
    category: string;
    tags: string;
    actionItems: string;
    metadata: string;
    createdAt: Date;
  }>
): Promise<QueryResult> {
  const entriesContext = entries
    .map(
      (e) =>
        `[ID: ${e.id}] (${toLocalDateStr(e.createdAt)}) [${e.category}] ${e.summary} | Metadata: ${e.metadata} | Raw: ${e.rawInput}`
    )
    .join("\n");

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: `You are an AI assistant that ONLY answers questions about the user's personal log entries. You must NEVER use outside knowledge, general information, or data not present in the log entries below. If the question is unrelated to the user's logs or no relevant entries exist, respond with a single short sentence explaining that the question doesn't relate to any information in their logs. Do not add any preamble about what you can or cannot do.

Log entries:
"""
${entriesContext}
"""

User question: "${question}"

Return a JSON object with:
- "answer": A natural language answer based ONLY on the log entries above. Do not include any information from outside these entries.
- "relevantEntryIds": An array of entry IDs (the [ID: ...] values) that are relevant to the question

Return ONLY valid JSON, no markdown formatting or code blocks.`,
      },
    ],
  });

  const text =
    message.content[0].type === "text" ? message.content[0].text : "";

  try {
    const parsed = JSON.parse(text);
    return {
      answer: parsed.answer || "I couldn't find a relevant answer.",
      relevantEntryIds: Array.isArray(parsed.relevantEntryIds)
        ? parsed.relevantEntryIds
        : [],
    };
  } catch {
    return {
      answer: "I had trouble processing that query. Please try again.",
      relevantEntryIds: [],
    };
  }
}

function buildQueryPrompt(
  question: string,
  entries: Array<{
    id: string;
    rawInput: string;
    summary: string;
    category: string;
    tags: string;
    metadata: string;
    createdAt: Date;
  }>
): string {
  const entriesContext = entries
    .map(
      (e) =>
        `[ID: ${e.id}] (${toLocalDateStr(e.createdAt)}) [${e.category}] ${e.summary} | Metadata: ${e.metadata} | Raw: ${e.rawInput}`
    )
    .join("\n");

  return `You are an AI assistant that ONLY answers questions about the user's personal log entries. You must NEVER use outside knowledge, general information, or data not present in the log entries below. If the question is unrelated to the user's logs or no relevant entries exist, respond with a single short sentence explaining that the question doesn't relate to any information in their logs. Do not add any preamble about what you can or cannot do.

Log entries:
"""
${entriesContext}
"""

User question: "${question}"

IMPORTANT: Structure your response in exactly this format:
1. First, write your natural language answer based ONLY on the log entries above. Do not include any information from outside these entries.
2. Then on a new line, write exactly: ---ENTRY_IDS---
3. Then on a new line, write a JSON array of relevant entry IDs, e.g. ["id1","id2"]

If no entries are relevant, write an empty array [].`;
}

export function queryLogsStreaming(
  question: string,
  entries: Array<{
    id: string;
    rawInput: string;
    summary: string;
    category: string;
    tags: string;
    actionItems: string;
    metadata: string;
    createdAt: Date;
  }>
): ReadableStream<Uint8Array> {
  const prompt = buildQueryPrompt(question, entries);
  const encoder = new TextEncoder();

  return new ReadableStream({
    async start(controller) {
      try {
        const stream = anthropic.messages.stream({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1024,
          messages: [{ role: "user", content: prompt }],
        });

        let fullText = "";

        stream.on("text", (text) => {
          fullText += text;
          const markerIdx = fullText.indexOf("---ENTRY_IDS---");
          if (markerIdx === -1) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "delta", text })}\n\n`));
          }
        });

        const finalMessage = await stream.finalMessage();
        const fullContent = finalMessage.content[0].type === "text" ? finalMessage.content[0].text : fullText;

        let relevantEntryIds: string[] = [];
        const markerIdx = fullContent.indexOf("---ENTRY_IDS---");
        if (markerIdx !== -1) {
          const idsStr = fullContent.slice(markerIdx + "---ENTRY_IDS---".length).trim();
          try {
            const parsed = JSON.parse(idsStr);
            if (Array.isArray(parsed)) relevantEntryIds = parsed;
          } catch { /* ignore */ }
        }

        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: "done", relevantEntryIds })}\n\n`)
        );
        controller.close();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Streaming failed";
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: "error", message: msg })}\n\n`)
        );
        controller.close();
      }
    },
  });
}
