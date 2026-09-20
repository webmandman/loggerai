// Relative imports on purpose, same as pantry.test.ts relies on: the "@/"
// alias does not resolve under the bare `node --test` run.
import { filterByDiet } from "./diet.ts";
import { matchKey, normalizeItemName, type ExistingItem } from "./normalize.ts";
import type { RecipeOptions, SavedRecipe } from "@/types";

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

/** True when the pantry covers this ingredient, or it is a staple. */
function inPantry(item: string, pantry: ExistingItem[]): boolean {
  const key = normalizeItemName(item);
  if (!key) return false;
  if (STAPLES.some((s) => key === s || key.endsWith(` ${s}`))) return true;
  return matchKey(key, pantry).via !== "none";
}

/**
 * Pick the kept recipes the household can cook right now, best first.
 *
 * Saved rows carry the `have` flags from the day they were suggested, and the
 * pantry has moved on since — so they are recomputed against what is actually
 * in stock before the missing-ingredient bar is applied. The rows arrive
 * favourites-first from the query, and that order is what survives here.
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
  const fresh = saved.map((r) => ({
    ...r,
    ingredients: r.ingredients.map((ing) => ({
      ...ing,
      have: inPantry(ing.item, pantry),
    })),
  }));

  return filterByDiet(fresh, options)
    .filter(
      (r) => r.ingredients.filter((i) => !i.have).length <= options.allowedMissing
    )
    .slice(0, limit);
}
