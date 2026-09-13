import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth-guard";
import { markAvailable, markNeeded } from "@/lib/pantry";

function serialize(item: {
  id: string;
  name: string;
  label: string;
  aliases: string;
  quantity: string | null;
  status: string;
  source: string;
  createdAt: Date;
  updatedAt: Date;
}) {
  let aliases: string[] = [];
  try {
    const parsed = JSON.parse(item.aliases);
    if (Array.isArray(parsed)) aliases = parsed;
  } catch {
    /* a malformed alias list must not take the whole pantry down */
  }

  return {
    ...item,
    aliases,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

export async function GET() {
  const { error } = await requireAuth();
  if (error) return error;

  const items = await prisma.pantryItem.findMany({ orderBy: { label: "asc" } });

  return NextResponse.json(
    {
      available: items.filter((i) => i.status === "available").map(serialize),
      needed: items.filter((i) => i.status === "needed").map(serialize),
    },
    { headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}

/** Manual add, for the things you know you need without saying it out loud. */
export async function POST(request: NextRequest) {
  const { error } = await requireAuth();
  if (error) return error;

  const { label, status } = await request.json();

  if (!label || typeof label !== "string" || !label.trim()) {
    return NextResponse.json({ error: "label is required" }, { status: 400 });
  }

  const input = [{ name: label.trim(), label: label.trim() }];
  const [item] =
    status === "available"
      ? await markAvailable(input, "manual")
      : await markNeeded(input, "manual");

  if (!item) {
    return NextResponse.json(
      { error: "That doesn't look like a food item." },
      { status: 400 }
    );
  }

  return NextResponse.json(serialize(item), { status: 201 });
}
