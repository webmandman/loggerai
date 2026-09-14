import type { SavedRecipe } from "@/types";

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
