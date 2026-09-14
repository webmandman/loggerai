import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth-guard";
import { serializeRecipe } from "@/lib/recipes";
import type { Recipe } from "@/types";

/** Favourites first, then most recently saved. */
export async function GET() {
  const { error } = await requireAuth();
  if (error) return error;

  const rows = await prisma.savedRecipe.findMany({
    orderBy: [{ favorite: "desc" }, { createdAt: "desc" }],
  });

  return NextResponse.json(
    { recipes: rows.map(serializeRecipe) },
    { headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}

/**
 * Keep a suggestion. Upsert on title so saving the same dish twice — easy to
 * do across two shuffles — updates it instead of littering the list.
 */
export async function POST(request: NextRequest) {
  const { error } = await requireAuth();
  if (error) return error;

  const body = (await request.json().catch(() => null)) as Recipe | null;

  if (
    !body ||
    typeof body.title !== "string" ||
    !body.title.trim() ||
    !Array.isArray(body.ingredients) ||
    !Array.isArray(body.steps)
  ) {
    return NextResponse.json({ error: "That is not a recipe" }, { status: 400 });
  }

  const data = {
    title: body.title.trim(),
    description: typeof body.description === "string" ? body.description : "",
    minutes: Number.isFinite(body.minutes) ? Math.round(body.minutes) : 0,
    servings: Number.isFinite(body.servings) ? Math.round(body.servings) : 0,
    ingredients: JSON.stringify(body.ingredients),
    steps: JSON.stringify(body.steps),
  };

  const row = await prisma.savedRecipe.upsert({
    where: { title: data.title },
    create: data,
    // `favorite` is deliberately absent: re-saving a dish must not clear a
    // star someone already put on it.
    update: data,
  });

  return NextResponse.json(serializeRecipe(row), { status: 201 });
}
