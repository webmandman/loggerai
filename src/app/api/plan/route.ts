import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth-guard";
import { serializeRecipe } from "@/lib/recipes";
import { MEAL_SLOTS } from "@/lib/plan";
import type { DayPlan, Meal } from "@/types";

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A day key and a day part, both validated.
 *
 * The date is a plain string all the way down, so an unchecked one would reach
 * the query as-is and quietly match nothing. Better to say so.
 */
function parseSlot(date: string | null, meal: string | null) {
  if (!date || !DATE_KEY.test(date)) return null;
  if (!meal || !MEAL_SLOTS.includes(meal as Meal)) return null;
  return { date, meal: meal as Meal };
}

/** Everything planned for one day, as three slots that are always present. */
export async function GET(request: NextRequest) {
  const { error } = await requireAuth();
  if (error) return error;

  const date = request.nextUrl.searchParams.get("date");
  if (!date || !DATE_KEY.test(date)) {
    return NextResponse.json({ error: "Need a YYYY-MM-DD date" }, { status: 400 });
  }

  const rows = await prisma.mealPlan.findMany({
    where: { date },
    include: { recipe: true },
  });

  const plan: DayPlan = { breakfast: null, lunch: null, dinner: null };
  for (const row of rows) {
    if (MEAL_SLOTS.includes(row.meal as Meal)) {
      plan[row.meal as Meal] = serializeRecipe(row.recipe);
    }
  }

  return NextResponse.json(
    { date, plan },
    { headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}

/**
 * Put a recipe in a slot. Upsert on (date, meal): a day part holds one dish,
 * so choosing again is a replacement, not a second breakfast.
 */
export async function PUT(request: NextRequest) {
  const { error } = await requireAuth();
  if (error) return error;

  const body = (await request.json().catch(() => null)) as {
    date?: string;
    meal?: string;
    recipeId?: string;
  } | null;

  const slot = parseSlot(body?.date ?? null, body?.meal ?? null);
  if (!slot) {
    return NextResponse.json({ error: "Need a date and a meal" }, { status: 400 });
  }
  if (typeof body?.recipeId !== "string" || !body.recipeId) {
    return NextResponse.json({ error: "Need a recipe" }, { status: 400 });
  }

  const recipe = await prisma.savedRecipe.findUnique({ where: { id: body.recipeId } });
  if (!recipe) {
    return NextResponse.json({ error: "Recipe not found" }, { status: 404 });
  }

  await prisma.mealPlan.upsert({
    where: { date_meal: { date: slot.date, meal: slot.meal } },
    create: { date: slot.date, meal: slot.meal, recipeId: recipe.id },
    update: { recipeId: recipe.id },
  });

  return NextResponse.json({
    date: slot.date,
    meal: slot.meal,
    recipe: serializeRecipe(recipe),
  });
}

/** Clear a slot. Already empty is a success — the caller wanted it empty. */
export async function DELETE(request: NextRequest) {
  const { error } = await requireAuth();
  if (error) return error;

  const params = request.nextUrl.searchParams;
  const slot = parseSlot(params.get("date"), params.get("meal"));
  if (!slot) {
    return NextResponse.json({ error: "Need a date and a meal" }, { status: 400 });
  }

  await prisma.mealPlan.deleteMany({ where: { date: slot.date, meal: slot.meal } });
  return NextResponse.json({ success: true });
}
