import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth-guard";
import { suggestRecipes } from "@/lib/ai";

// Five full recipes is a long generation; the 10s serverless default 504s.
export const maxDuration = 60;

export async function GET() {
  const { error } = await requireAuth();
  if (error) return error;

  const items = await prisma.pantryItem.findMany({
    where: { status: "available" },
    select: { label: true, quantity: true },
    orderBy: { label: "asc" },
  });

  if (items.length < 3) {
    return NextResponse.json(
      { recipes: [], pantryCount: items.length },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  }

  try {
    const recipes = await suggestRecipes(
      items.map((i) => (i.quantity ? `${i.label} (${i.quantity})` : i.label))
    );
    return NextResponse.json(
      { recipes, pantryCount: items.length },
      // Always a fresh set: the pantry changes, and a stale answer suggests
      // cooking with food that has already been eaten.
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not suggest recipes";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
