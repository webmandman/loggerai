import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth-guard";
import { processLogEntry } from "@/lib/ai";
import { markAvailable, markNeeded } from "@/lib/pantry";

// Re-reading a long dictated list is a full extraction pass, not a quick call.
export const maxDuration = 60;

/**
 * Push an existing log entry's groceries into the pantry.
 *
 * Covers entries written before grocery extraction existed, and anything the
 * automatic pass missed. Runs against the entry's original `rawInput`, so it
 * sees exactly what was said rather than the summary.
 *
 * Deliberately reuses processLogEntry rather than a dedicated grocery prompt:
 * a second prompt would drift from the live one, and reusing it means pressing
 * this button exercises exactly the path a new message takes.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth();
  if (error) return error;

  const { id } = await params;

  const entry = await prisma.logEntry.findUnique({ where: { id } });
  if (!entry) {
    return NextResponse.json({ error: "Entry not found" }, { status: 404 });
  }

  let groceries;
  try {
    groceries = await processLogEntry(entry.rawInput);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Extraction failed";

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
      { error: `Could not read groceries from that entry: ${message}` },
      { status: 500 }
    );
  }

  if (groceries.stocked.length === 0 && groceries.consumed.length === 0) {
    return NextResponse.json(
      { error: "No groceries found in that entry." },
      { status: 422 }
    );
  }

  // Same order as the live write paths: stocked first, so an entry mentioning
  // both leaves the depleted item needed rather than back in stock.
  const stocked = await markAvailable(groceries.stocked, "message");
  const needed = await markNeeded(groceries.consumed);

  return NextResponse.json({
    stocked: stocked.map((i) => i.label),
    needed: needed.map((i) => i.label),
  });
}
