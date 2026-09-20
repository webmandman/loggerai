import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth-guard";
import { classifyIntent, extractDictatedRecipe, processLogEntry } from "@/lib/ai";
import { availableItems, markAvailable, markNeeded } from "@/lib/pantry";
import { serializeRecipe, withPantryFlags } from "@/lib/recipes";
import { normalizeActionItems, parseLocalDate } from "@/lib/utils";

// Writing a full cooking method is the same size of generation as suggesting
// five recipes, which is why /api/recipes/suggest raises this too. The log path
// through here already ran a 16k-token call on the 10s default and got away
// with it; the recipe path would not.
export const maxDuration = 60;

/** The Anthropic failure modes worth their own message, for either AI call. */
function aiFailure(err: unknown, what: string): NextResponse {
  const message = err instanceof Error ? err.message : "AI processing failed";

  if (message.includes("401") || message.includes("authentication")) {
    return NextResponse.json(
      {
        error:
          "Invalid Anthropic API key. Check ANTHROPIC_API_KEY in your .env file.",
      },
      { status: 401 }
    );
  }
  if (message.includes("429") || message.includes("rate")) {
    return NextResponse.json(
      { error: "Anthropic rate limit hit. Wait a moment and try again." },
      { status: 429 }
    );
  }
  return NextResponse.json({ error: `${what}: ${message}` }, { status: 500 });
}

export async function POST(request: NextRequest) {
  const { session, error } = await requireAuth();
  if (error) return error;

  const body = await request.json();
  const { rawInput, inputMethod } = body;

  if (!rawInput || typeof rawInput !== "string" || !rawInput.trim()) {
    return NextResponse.json(
      { error: "rawInput is required" },
      { status: 400 }
    );
  }

  const trimmed = rawInput.trim();

  let intent: "log" | "query" | "recipe" | "reject";
  try {
    intent = await classifyIntent(trimmed);
  } catch (err) {
    console.error("classifyIntent failed", err);
    return NextResponse.json(
      {
        error: `Failed to classify intent: ${
          err instanceof Error ? err.message : String(err)
        }`,
      },
      { status: 500 }
    );
  }

  if (intent === "reject") {
    return NextResponse.json(
      { error: "This doesn't look like a personal log entry or question about your logs. Please try rephrasing." },
      { status: 400 }
    );
  }

  if (intent === "query") {
    return NextResponse.json({ type: "query_stream" });
  }

  if (intent === "recipe") {
    return saveDictatedRecipe(trimmed, inputMethod, session!.user!.id);
  }

  // intent === "log"
  let processed;
  try {
    processed = await processLogEntry(trimmed);
  } catch (err) {
    return aiFailure(err, "AI processing failed");
  }

  const createdAt = processed.occurredAt ? parseLocalDate(processed.occurredAt) : undefined;

  const entry = await prisma.logEntry.create({
    data: {
      rawInput: trimmed,
      summary: processed.summary,
      category: processed.category,
      tags: JSON.stringify(processed.tags),
      actionItems: JSON.stringify(processed.actionItems),
      metadata: JSON.stringify(processed.metadata),
      mood: processed.mood,
      inputMethod: inputMethod || "text",
      userId: session!.user!.id,
      ...(createdAt ? { createdAt } : {}),
    },
  });

  // "In the fridge we have milk and eggs" -> stocked. "We ran out of bananas"
  // -> shopping list. Stocked runs first so that if one message says both, the
  // depleted item ends up needed rather than silently back in stock.
  // ponytail: this route and /api/logs POST are near-duplicate write paths;
  // both need these calls. Merge them if a third write path ever appears.
  const stocked = await markAvailable(processed.stocked, "message");
  const needed = await markNeeded(processed.consumed);

  return NextResponse.json(
    {
      type: "log",
      addedToShoppingList: needed.map((i) => i.label),
      addedToPantry: stocked.map((i) => i.label),
      entry: {
        ...entry,
        tags: JSON.parse(entry.tags),
        actionItems: normalizeActionItems(JSON.parse(entry.actionItems)),
        metadata: JSON.parse(entry.metadata || "{}"),
        createdAt: entry.createdAt.toISOString(),
        updatedAt: entry.updatedAt.toISOString(),
      },
    },
    { status: 201 }
  );
}

/**
 * Keep a spoken recipe, and pin it to a day part if one was spoken with it.
 *
 * Deliberately does NOT go through processLogEntry. Besides the second model
 * call, that prompt extracts `stocked[]` — so dictating a recipe would put
 * every ingredient of a dish you have not cooked yet into the pantry as food
 * the household owns. The log entry is written here by hand instead, the same
 * way /api/receipt does it.
 *
 * ponytail: the two upserts below duplicate /api/recipes POST and /api/plan
 * PUT. Those exist to validate untrusted client bodies; this input comes from
 * our own parser, and the shared-helper version cannot live in lib/recipes.ts
 * without dragging prisma into a file the node --test suite imports. Extract
 * one if a fourth caller ever shows up.
 */
async function saveDictatedRecipe(
  trimmed: string,
  inputMethod: unknown,
  userId: string
): Promise<NextResponse> {
  let dictated;
  try {
    dictated = await extractDictatedRecipe(trimmed);
  } catch (err) {
    return aiFailure(err, "Could not read that recipe");
  }

  if (!dictated) {
    return NextResponse.json(
      { error: "I couldn't hear a recipe in that. Try the dish name and its ingredients." },
      { status: 422 }
    );
  }
  if (dictated.recipe.steps.length === 0) {
    return NextResponse.json(
      { error: "I got the ingredients but no method. Say that again?" },
      { status: 422 }
    );
  }

  const recipe = withPantryFlags(dictated.recipe, await availableItems());

  // Read before the upsert: afterwards there is no telling whether this dish
  // was already on the list, and "Updated" vs "Saved" is the only warning that
  // a dictation just overwrote a recipe someone kept.
  const existed = await prisma.savedRecipe.findUnique({
    where: { title: recipe.title },
    select: { id: true },
  });

  const data = {
    title: recipe.title,
    description: recipe.description,
    minutes: recipe.minutes,
    servings: recipe.servings,
    ingredients: JSON.stringify(recipe.ingredients),
    steps: JSON.stringify(recipe.steps),
  };

  const row = await prisma.savedRecipe.upsert({
    where: { title: data.title },
    create: data,
    // `favorite` absent for the same reason as /api/recipes POST: re-saving a
    // dish must not clear a star someone already put on it.
    update: data,
  });

  const plan = dictated.plan;
  if (plan) {
    await prisma.mealPlan.upsert({
      where: { date_meal: { date: plan.date, meal: plan.meal } },
      create: { date: plan.date, meal: plan.meal, recipeId: row.id },
      update: { recipeId: row.id },
    });
  }

  const summary = (
    plan
      ? `Saved recipe: ${row.title} · ${plan.meal} on ${plan.date}`
      : `Saved recipe: ${row.title}`
  ).slice(0, 100);

  const entry = await prisma.logEntry.create({
    data: {
      rawInput: trimmed,
      summary,
      // Reuses the category /api/receipt already writes. A "recipe" category
      // would mean moving CATEGORIES, the badge colours and the feed filter
      // bar to gain a chip for rows the "recipe" tag already finds.
      category: "grocery",
      tags: JSON.stringify(plan ? ["recipe", "mealplan"] : ["recipe"]),
      actionItems: JSON.stringify([]),
      metadata: JSON.stringify({
        recipeId: row.id,
        title: row.title,
        minutes: row.minutes,
        servings: row.servings,
        ingredientCount: recipe.ingredients.length,
        planDate: plan?.date ?? null,
        planMeal: plan?.meal ?? null,
      }),
      mood: null,
      inputMethod: typeof inputMethod === "string" ? inputMethod : "text",
      userId,
    },
  });

  return NextResponse.json(
    {
      type: "recipe",
      recipe: serializeRecipe(row),
      plan,
      updated: existed !== null,
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
