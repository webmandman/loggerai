import type { Recipe, RecipeOptions } from "@/types";

/**
 * Ingredient words that break each restriction.
 *
 * ponytail: a word list, not an ingredient database — it catches the obvious
 * leaks (cheddar in a "lactose free" frittata, which the model really did
 * return) and nothing subtle. Swap in a real ingredient taxonomy if these
 * toggles ever need to be trusted for an allergy rather than a preference.
 */
const DIET_BANNED: Record<"lactoseFree" | "glutenFree", string[]> = {
  lactoseFree: [
    "milk", "cream", "butter", "cheese", "cheddar", "parmesan", "mozzarella",
    "feta", "ricotta", "yogurt", "yoghurt", "ghee", "custard", "ice cream",
  ],
  glutenFree: [
    "bread", "breadcrumb", "pasta", "spaghetti", "noodle", "flour", "couscous",
    "wheat", "barley", "rye", "cracker", "tortilla", "soy sauce", "panko", "orzo",
  ],
};

/**
 * Drop recipes that break a restriction the cook switched on.
 *
 * The prompt already states these as hard constraints and the model mostly
 * obeys, but "mostly" is the wrong standard for someone avoiding lactose. A
 * qualified ingredient ("lactose-free milk", "gluten-free pasta") is fine and
 * must survive the filter.
 */
export function filterByDiet<T extends Recipe>(recipes: T[], options: RecipeOptions): T[] {
  const active = (["lactoseFree", "glutenFree"] as const).filter((k) => options[k]);
  if (active.length === 0) return recipes;

  return recipes.filter((r) =>
    r.ingredients.every((ing) => {
      const name = ing.item.toLowerCase();
      if (/(^|\W)(lactose|gluten|dairy)[\s-]*free/.test(name)) return true;
      return !active.some((k) => DIET_BANNED[k].some((word) => name.includes(word)));
    })
  );
}
