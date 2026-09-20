// Run: npm run test:recipes  (node --test, Node 24 strips the types natively)
// Relative import on purpose — the "@/" alias does not resolve under bare node.
import { test } from "node:test";
import assert from "node:assert/strict";
import { matchFromSaved, parseDictatedRecipe } from "./recipes.ts";
import type { RecipeOptions, SavedRecipe } from "../types/index.ts";

const OPTIONS: RecipeOptions = {
  meal: "dinner",
  servings: 5,
  allowedMissing: 1,
  lactoseFree: false,
  glutenFree: false,
  carbHeavy: false,
  proteinHeavy: false,
  newOnly: false,
};

const PANTRY = [
  { name: "rice", aliases: [] },
  { name: "chicken breast", aliases: [] },
  { name: "onion", aliases: [] },
  { name: "greek yogurt", aliases: ["creamer"] },
];

function saved(title: string, items: string[], favorite = false): SavedRecipe {
  return {
    id: title,
    title,
    description: "",
    minutes: 20,
    servings: 5,
    // `have: false` throughout: the point is that it gets recomputed.
    ingredients: items.map((item) => ({ item, amount: "1", have: false })),
    steps: ["cook it"],
    favorite,
    createdAt: "2026-09-01T00:00:00.000Z",
  };
}

const friedRice = saved("Chicken Fried Rice", ["Rice", "Chicken Breast", "Onion", "Salt"]);
const paella = saved("Paella", ["Rice", "Saffron", "Prawns", "Chorizo"]);

test("a cookable saved recipe comes back with have recomputed from the pantry", () => {
  const out = matchFromSaved([friedRice], PANTRY, OPTIONS, 5);
  assert.deepEqual(out.map((r) => r.title), ["Chicken Fried Rice"]);
  // Salt is a staple, the other three are in the pantry.
  assert.equal(out[0].ingredients.every((i) => i.have), true);
});

test("a recipe needing more than allowedMissing is dropped", () => {
  assert.deepEqual(matchFromSaved([paella], PANTRY, OPTIONS, 5), []);
  // Three missing is fine once three are allowed.
  const loose = matchFromSaved([paella], PANTRY, { ...OPTIONS, allowedMissing: 3 }, 5);
  assert.deepEqual(loose.map((r) => r.title), ["Paella"]);
});

test("word-subset matching counts greek yogurt as yogurt", () => {
  const raita = saved("Raita", ["Yogurt", "Onion"]);
  const out = matchFromSaved([raita], PANTRY, OPTIONS, 5);
  assert.deepEqual(out.map((r) => r.title), ["Raita"]);
});

test("diet is left to the caller's screening, not decided here", () => {
  // Was the opposite assertion, back when this ran filterByDiet. The word list
  // kept the unsafe dishes it was there for and dropped safe ones on a bare
  // word match, so screening moved wholesale to screenDiet — which the suggest
  // route runs over this result. Anything dropped here would never reach it.
  const creamy = saved("Creamy Chicken Rice", ["Rice", "Chicken Breast", "Cream"]);
  const out = matchFromSaved([creamy, friedRice], PANTRY, {
    ...OPTIONS,
    lactoseFree: true,
  }, 5);
  assert.deepEqual(out.map((r) => r.title), ["Creamy Chicken Rice", "Chicken Fried Rice"]);
});

test("the limit caps how many slots kept recipes take", () => {
  const rows = [friedRice, saved("Chicken Rice Bowl", ["Rice", "Chicken Breast"])];
  assert.equal(matchFromSaved(rows, PANTRY, OPTIONS, 1).length, 1);
});

// --- dictated recipes ---------------------------------------------------

const TODAY = "2026-09-19"; // a Saturday

/** What the model hands back for "lemon chicken for Monday's dinner". */
function dictation(over: Record<string, unknown> = {}) {
  return {
    title: "Lemon Garlic Chicken",
    description: "Bright, garlicky, one pan.",
    minutes: 45,
    servings: 4,
    ingredients: [
      { item: "Chicken Thighs", amount: "6" },
      { item: "Lemons", amount: "2" },
    ],
    steps: ["Heat the oven.", "Roast until done."],
    planDate: "2026-09-21",
    planMeal: "dinner",
    ...over,
  };
}

test("a dictated recipe keeps its slot and leaves have for the pantry pass", () => {
  const out = parseDictatedRecipe(dictation(), TODAY);
  assert.deepEqual(out?.plan, { date: "2026-09-21", meal: "dinner" });
  assert.equal(out?.recipe.title, "Lemon Garlic Chicken");
  assert.equal(out?.recipe.steps.length, 2);
  assert.equal(out?.recipe.ingredients.every((i) => i.have === false), true);
});

test("a day the model put in the past rolls forward a week", () => {
  // "Monday" heard as the Monday just gone, two days before today.
  const out = parseDictatedRecipe(dictation({ planDate: "2026-09-14" }), TODAY);
  assert.deepEqual(out?.plan, { date: "2026-09-21", meal: "dinner" });
});

test("a day too far in the past drops the plan but keeps the recipe", () => {
  const out = parseDictatedRecipe(dictation({ planDate: "2026-08-10" }), TODAY);
  assert.equal(out?.plan, null);
  assert.equal(out?.recipe.title, "Lemon Garlic Chicken");
});

test("a meal that is not a slot drops the plan but keeps the recipe", () => {
  const out = parseDictatedRecipe(dictation({ planMeal: "supper" }), TODAY);
  assert.equal(out?.plan, null);
  assert.equal(out?.recipe.ingredients.length, 2);
});

test("no dish name and no ingredients are both nothing to save", () => {
  assert.equal(parseDictatedRecipe(dictation({ title: "  " }), TODAY), null);
  assert.equal(parseDictatedRecipe(dictation({ ingredients: [] }), TODAY), null);
  assert.equal(parseDictatedRecipe(null, TODAY), null);
});

test("one real ingredient padded out with staples is a request, not a recipe", () => {
  // What the model actually returns for "save a recipe for chicken".
  const invented = dictation({
    title: "Simple Pan-Seared Chicken",
    ingredients: [
      { item: "Chicken", amount: "" },
      { item: "Salt", amount: "to taste" },
      { item: "Black Pepper", amount: "to taste" },
      { item: "Cooking Oil", amount: "2 tbsp" },
    ],
  });
  assert.equal(parseDictatedRecipe(invented, TODAY), null);

  // Two real ingredients is enough, staples or not.
  const real = dictation({
    ingredients: [
      { item: "Oats", amount: "1 cup" },
      { item: "Milk", amount: "1 cup" },
      { item: "Salt", amount: "a pinch" },
    ],
  });
  assert.equal(parseDictatedRecipe(real, TODAY)?.recipe.ingredients.length, 3);
});
