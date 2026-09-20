import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth-guard";
import { suggestRecipes } from "@/lib/ai";
import { matchFromSaved, serializeRecipe } from "@/lib/recipes";
import { screenDiet } from "@/lib/diet-check";
import { PREFERENCES_KEY } from "@/lib/preferences";
import { defaultRecipeOptions, type Meal, type RecipeOptions } from "@/types";

// Five full recipes is a long generation; the 10s serverless default 504s.
export const maxDuration = 60;

const MEALS: Meal[] = ["breakfast", "lunch", "dinner"];

/** How many suggestions a click should end up with, kept plus generated. */
const WANTED = 5;

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
    newOnly: b.newOnly === true,
  };
}

/**
 * Kept recipes first, generation only for the slots they leave empty.
 *
 * Asking the model for five dishes when three favourites already fit the
 * pantry is both slower and worse — the cook saved those for a reason. "New
 * only" skips the kept ones outright, for when they want something else.
 */
export async function POST(request: NextRequest) {
  const { error } = await requireAuth();
  if (error) return error;

  const options = parseOptions(await request.json().catch(() => ({})));

  const items = await prisma.pantryItem.findMany({
    where: { status: "available" },
    select: { name: true, label: true, quantity: true, aliases: true },
    orderBy: { label: "asc" },
  });

  if (items.length < 3) {
    return NextResponse.json({ recipes: [], pantryCount: items.length });
  }

  const kept = options.newOnly ? [] : await keptMatches(items, options);

  if (kept.length >= WANTED) {
    return NextResponse.json({ recipes: kept, pantryCount: items.length });
  }

  try {
    const prefs = await prisma.setting.findUnique({ where: { key: PREFERENCES_KEY } });

    const fresh = await suggestRecipes(
      items.map((i) => (i.quantity ? `${i.label} (${i.quantity})` : i.label)),
      options,
      WANTED - kept.length,
      kept.map((r) => r.title),
      prefs?.value ?? ""
    );
    return NextResponse.json({
      recipes: [...kept, ...fresh],
      pantryCount: items.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not suggest recipes";
    // Losing the generation should not also lose the recipes we already have.
    if (kept.length > 0) {
      return NextResponse.json({
        recipes: kept,
        pantryCount: items.length,
        error: message,
      });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

type PantryRow = { name: string; label: string; quantity: string | null; aliases: string };

async function keptMatches(items: PantryRow[], options: RecipeOptions) {
  const rows = await prisma.savedRecipe.findMany({
    orderBy: [{ favorite: "desc" }, { createdAt: "desc" }],
  });

  const pantry = items.map((i) => ({
    name: i.name,
    aliases: parseAliases(i.aliases),
  }));

  // Screened as well as filtered: a kept recipe was saved before the cook
  // switched a restriction on, so it gets the same pass a fresh suggestion
  // gets. Dropping one here just leaves a slot for generation to fill.
  return screenDiet(
    matchFromSaved(rows.map(serializeRecipe), pantry, options, WANTED),
    options
  );
}

/** Aliases are a JSON text column; a malformed one is just no aliases. */
function parseAliases(raw: string): string[] {
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((a) => typeof a === "string") : [];
  } catch {
    return [];
  }
}
