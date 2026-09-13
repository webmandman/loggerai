import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth-guard";
import { planMerge } from "@/lib/normalize";

function parseAliases(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((a) => typeof a === "string") : [];
  } catch {
    return [];
  }
}

/**
 * Fold one pantry row into another when alias matching let a duplicate through.
 *
 * The source row's name and aliases move onto the target, so the wording that
 * caused the split resolves correctly from now on, and the source is deleted.
 */
export async function POST(request: NextRequest) {
  const { error } = await requireAuth();
  if (error) return error;

  const { fromId, intoId } = await request.json();

  if (typeof fromId !== "string" || typeof intoId !== "string") {
    return NextResponse.json(
      { error: "fromId and intoId are required" },
      { status: 400 }
    );
  }

  if (fromId === intoId) {
    return NextResponse.json(
      { error: "Cannot merge an item into itself" },
      { status: 400 }
    );
  }

  const [from, into] = await Promise.all([
    prisma.pantryItem.findUnique({ where: { id: fromId } }),
    prisma.pantryItem.findUnique({ where: { id: intoId } }),
  ]);

  if (!from || !into) {
    return NextResponse.json({ error: "Item not found" }, { status: 404 });
  }

  const plan = planMerge(
    { ...from, aliases: parseAliases(from.aliases) },
    { ...into, aliases: parseAliases(into.aliases) }
  );

  // Delete first: the source's name may need to be free before it can be
  // written onto the target's alias list without confusing a later lookup.
  const [, updated] = await prisma.$transaction([
    prisma.pantryItem.delete({ where: { id: fromId } }),
    prisma.pantryItem.update({
      where: { id: intoId },
      data: {
        aliases: JSON.stringify(plan.aliases),
        quantity: plan.quantity,
      },
    }),
  ]);

  return NextResponse.json({
    merged: from.label,
    into: updated.label,
    item: {
      ...updated,
      aliases: plan.aliases,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    },
  });
}
