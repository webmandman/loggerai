import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth-guard";
import { extractReceipt, type ReceiptMediaType } from "@/lib/ai";
import { markAvailable, resolveNames } from "@/lib/pantry";
import { parseLocalDate } from "@/lib/utils";

// Vision on a full receipt runs well past the 10s serverless default; without
// this the route 504s in production while working fine locally.
export const maxDuration = 60;

const MAX_BYTES = 4 * 1024 * 1024; // Vercel request body cap

const MEDIA_TYPES: Record<string, ReceiptMediaType> = {
  "image/jpeg": "image/jpeg",
  "image/jpg": "image/jpeg",
  "image/png": "image/png",
  "image/webp": "image/webp",
  "image/gif": "image/gif",
};

export async function POST(request: NextRequest) {
  const { session, error } = await requireAuth();
  if (error) return error;

  const formData = await request.formData();
  const image = formData.get("image") as File | null;

  if (!image) {
    return NextResponse.json({ error: "No image provided" }, { status: 400 });
  }

  const mediaType = MEDIA_TYPES[image.type.split(";")[0].trim().toLowerCase()];
  if (!mediaType) {
    return NextResponse.json(
      { error: "Unsupported image type. Use JPEG, PNG, WebP or GIF." },
      { status: 400 }
    );
  }

  if (image.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "That photo is too large. Retake it or crop to just the receipt." },
      { status: 413 }
    );
  }

  const base64 = Buffer.from(await image.arrayBuffer()).toString("base64");

  let scan;
  try {
    scan = await extractReceipt(base64, mediaType);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Receipt scan failed";

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
      { error: `Receipt scan failed: ${message}` },
      { status: 500 }
    );
  }

  if (scan.items.length === 0) {
    return NextResponse.json(
      { error: "No items found. Make sure the whole receipt is in frame and in focus." },
      { status: 422 }
    );
  }

  // Which of these were on the shopping list before this scan? Read it first —
  // markAvailable is what clears them, so afterwards the answer is gone.
  // Resolve through aliases first, so a receipt line "Half & Half" is known to
  // clear a shopping-list row added as "creamer".
  const names = await resolveNames(scan.items);
  const clearedFromList = (
    await prisma.pantryItem.findMany({
      where: { name: { in: names }, status: "needed" },
      select: { label: true },
    })
  ).map((i) => i.label);

  const stocked = await markAvailable(scan.items);

  const store = scan.store || "the store";
  const createdAt = scan.purchasedAt ? parseLocalDate(scan.purchasedAt) : undefined;

  const entry = await prisma.logEntry.create({
    data: {
      rawInput: `Grocery receipt from ${store}: ${stocked
        .map((i) => i.label)
        .join(", ")}`,
      summary: `Stocked ${stocked.length} item${stocked.length === 1 ? "" : "s"} from ${store}`,
      category: "grocery",
      tags: JSON.stringify(["groceries", "receipt"]),
      actionItems: JSON.stringify([]),
      metadata: JSON.stringify({
        store: scan.store,
        purchasedAt: scan.purchasedAt,
        itemCount: stocked.length,
        items: stocked.map((i) => ({ label: i.label, quantity: i.quantity })),
        clearedFromShoppingList: clearedFromList,
      }),
      mood: null,
      inputMethod: "photo",
      userId: session!.user!.id,
      ...(createdAt ? { createdAt } : {}),
    },
  });

  return NextResponse.json(
    {
      store: scan.store,
      stocked: stocked.map((i) => ({ label: i.label, quantity: i.quantity })),
      clearedFromList,
      entry: {
        ...entry,
        tags: JSON.parse(entry.tags),
        actionItems: [],
        metadata: JSON.parse(entry.metadata),
        createdAt: entry.createdAt.toISOString(),
        updatedAt: entry.updatedAt.toISOString(),
      },
    },
    { status: 201 }
  );
}
