// Relative imports on purpose, same as pantry.test.ts relies on: the "@/"
// alias does not resolve under the bare `node --test` run.
import { matchKey, normalizeItemName, type ExistingItem } from "./normalize.ts";
import { MEAL_SLOTS, daysBetween, shiftDateStr } from "./plan.ts";
import type { SlotResult } from "./plan-slot.ts";
import type { Meal, Recipe, RecipeOptions, SavedRecipe } from "@/types";

type Row = {
  id: string;
  title: string;
  description: string;
  minutes: number;
  servings: number;
  ingredients: string;
  steps: string;
  favorite: boolean;
  createdAt: Date;
};

/**
 * Turn a stored row into the shape the client uses.
 *
 * The JSON columns are text, as everywhere else in this schema, and a
 * malformed one falls back to empty rather than taking the whole list down.
 */
export function serializeRecipe(row: Row): SavedRecipe {
  const parse = <T,>(raw: string, fallback: T): T => {
    try {
      const v = JSON.parse(raw);
      return Array.isArray(v) ? (v as T) : fallback;
    } catch {
      return fallback;
    }
  };

  return {
    id: row.id,
    title: row.title,
    description: row.description,
    minutes: row.minutes,
    servings: row.servings,
    ingredients: parse(row.ingredients, []),
    steps: parse(row.steps, []),
    favorite: row.favorite,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Assumed on hand, matching what the prompt tells the model to assume. Without
 * these every saved recipe counts salt as a missing ingredient and nothing
 * clears the allowedMissing bar.
 */
const STAPLES = ["salt", "pepper", "water", "oil"];

/** Salt, black pepper, cooking oil — things nobody shops for on purpose. */
function isStaple(item: string): boolean {
  const key = normalizeItemName(item);
  return !!key && STAPLES.some((s) => key === s || key.endsWith(` ${s}`));
}

/** True when the pantry covers this ingredient, or it is a staple. */
function inPantry(item: string, pantry: ExistingItem[]): boolean {
  const key = normalizeItemName(item);
  if (!key) return false;
  if (isStaple(key)) return true;
  return matchKey(key, pantry).via !== "none";
}

/**
 * Recompute a recipe's `have` flags against a pantry.
 *
 * Split out of matchFromSaved because a dictated recipe needs the same pass at
 * the moment it is saved: the Saved tab renders whatever flags are in the row,
 * so a recipe stored with everything `false` reads as "you have none of this"
 * the second after you dictated it.
 */
export function withPantryFlags<T extends Recipe>(recipe: T, pantry: ExistingItem[]): T {
  return {
    ...recipe,
    ingredients: recipe.ingredients.map((ing) => ({
      ...ing,
      have: inPantry(ing.item, pantry),
    })),
  };
}

/**
 * Pick the kept recipes the household can cook right now, best first.
 *
 * Saved rows carry the `have` flags from the day they were suggested, and the
 * pantry has moved on since — so they are recomputed against what is actually
 * in stock before the missing-ingredient bar is applied. The rows arrive
 * favourites-first from the query, and that order is what survives here.
 *
 * Diet is NOT decided here. It used to be, via filterByDiet, but that pass
 * dropped safe dishes on a word match (rice noodles read as "noodle") without
 * catching the unsafe ones it was there for. The caller runs `screenDiet` over
 * the result instead — see the header of diet-check.ts for the measurement.
 * This stays pure and synchronous so the node --test suite can import it.
 *
 * ponytail: no meal filter — nothing on a saved row says breakfast or dinner,
 * so a kept pancake can show up under dinner. Add a `meal` column and pass it
 * through the save if that starts to grate.
 */
export function matchFromSaved(
  saved: SavedRecipe[],
  pantry: ExistingItem[],
  options: RecipeOptions,
  limit: number
): SavedRecipe[] {
  return saved
    .map((r) => withPantryFlags(r, pantry))
    .filter(
      (r) => r.ingredients.filter((i) => !i.have).length <= options.allowedMissing
    )
    .slice(0, limit);
}

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

/** What a dictated recipe resolves to: the dish, and a day part to eat it in. */
export interface DictatedRecipe {
  recipe: Recipe;
  plan: { date: string; meal: Meal } | null;
}

/**
 * Turn the model's reading of a spoken recipe into something safe to write.
 *
 * Pure, so the date arithmetic that decides which Monday you meant is testable
 * without a database or an API key. Everything here degrades rather than
 * throws: a plan that cannot be trusted is dropped and the recipe still saves,
 * because losing the dish you just dictated is the worse failure.
 *
 * Returns null when there is no recipe in there at all — no name, or nothing
 * to cook with. The route turns that into a "say that again" rather than
 * saving an empty row.
 *
 * `slot` is the day part already settled by `resolveSlot`, which picks from a
 * list of days that code built forward from today. Passing it — including as
 * `null`, meaning they named no day — is what makes a past date impossible.
 * Leaving it `undefined` means it could not be asked, and the model's own
 * planDate is used with the repair loop below.
 */
export function parseDictatedRecipe(
  raw: unknown,
  today: string,
  slot?: SlotResult
): DictatedRecipe | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;

  const title = typeof r.title === "string" ? r.title.trim() : "";
  if (!title) return null;

  const ingredients = Array.isArray(r.ingredients)
    ? r.ingredients.flatMap((entry) => {
        if (!entry || typeof entry !== "object") return [];
        const e = entry as Record<string, unknown>;
        const item = typeof e.item === "string" ? e.item.trim() : "";
        if (!item) return [];
        // `have` is filled in later against the live pantry; the model that
        // read this dictation was never shown one.
        return [{ item, amount: typeof e.amount === "string" ? e.amount.trim() : "", have: false }];
      })
    : [];

  // Two real ingredients, not counting staples. "Save a recipe for chicken" is
  // a request, not a dictation, and the model answers it by inventing a dish
  // and padding it out with salt, pepper and oil — which then saves as if the
  // cook had said it. Verified against the live model 2026-09-19.
  if (ingredients.filter((i) => !isStaple(i.item)).length < 2) return null;

  const steps = Array.isArray(r.steps)
    ? r.steps
        .filter((s): s is string => typeof s === "string")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];

  const int = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v) : 0);

  const recipe: Recipe = {
    title,
    description: typeof r.description === "string" ? r.description.trim() : "",
    minutes: int(r.minutes),
    servings: int(r.servings),
    ingredients,
    steps,
  };

  return { recipe, plan: slot !== undefined ? slot : repairModelDate(r, today) };
}

/**
 * The old way of settling the day: take the model's own date and walk it
 * forward until it is not in the past.
 *
 * Only reached when `resolveSlot` could not run. It is kept because it works,
 * not because it is good — the model resolves "Monday" to the Monday just gone
 * often enough that this loop exists, and a date more than two weeks stale
 * still ends up dropped. When the slot can be chosen from a list of days that
 * are all today or later, none of this can arise.
 */
function repairModelDate(r: Record<string, unknown>, today: string): DictatedRecipe["plan"] {
  const meal = MEAL_SLOTS.includes(r.planMeal as Meal) ? (r.planMeal as Meal) : null;
  let date =
    typeof r.planDate === "string" && DATE_KEY.test(r.planDate) ? r.planDate : null;

  if (!date || !meal) return null;

  // Walk it forward a week at a time; still past after two, it was misheard —
  // drop the plan, keep the recipe, and let them pick a day on the Plan tab.
  for (let i = 0; i < 2 && daysBetween(today, date) < 0; i++) {
    date = shiftDateStr(date, 7);
  }

  return daysBetween(today, date) >= 0 ? { date, meal } : null;
}
