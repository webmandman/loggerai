import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth-guard";
import { suggestRecipes } from "@/lib/ai";
import { defaultRecipeOptions, type Meal, type RecipeOptions } from "@/types";

// Five full recipes is a long generation; the 10s serverless default 504s.
export const maxDuration = 60;

const MEALS: Meal[] = ["breakfast", "lunch", "dinner"];

/**
 * Options come from a client the user controls, so clamp rather than trust.
 * A servings value of 10000 would otherwise reach the prompt verbatim.
 */
function parseOptions(body: unknown): RecipeOptions {
  const b = (body ?? {}) as Record<string, unknown>;
  const fallback = defaultRecipeOptions();
  const int = (v: unknown, lo: number, hi: number, dflt: number) => {
    const n = typeof v === "number" ? Math.round(v) : NaN;
    return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt;
  };

  return {
    meal: MEALS.includes(b.meal as Meal) ? (b.meal as Meal) : fallback.meal,
    servings: int(b.servings, 1, 5, fallback.servings),
    allowedMissing: int(b.allowedMissing, 1, 3, fallback.allowedMissing),
    lactoseFree: b.lactoseFree === true,
    glutenFree: b.glutenFree === true,
    carbHeavy: b.carbHeavy === true,
    proteinHeavy: b.proteinHeavy === true,
  };
}

export async function POST(request: NextRequest) {
  const { error } = await requireAuth();
  if (error) return error;

  const options = parseOptions(await request.json().catch(() => ({})));

  const items = await prisma.pantryItem.findMany({
    where: { status: "available" },
    select: { label: true, quantity: true },
    orderBy: { label: "asc" },
  });

  if (items.length < 3) {
    return NextResponse.json({ recipes: [], pantryCount: items.length });
  }

  try {
    const recipes = await suggestRecipes(
      items.map((i) => (i.quantity ? `${i.label} (${i.quantity})` : i.label)),
      options
    );
    return NextResponse.json({ recipes, pantryCount: items.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not suggest recipes";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
