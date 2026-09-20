// Run: npm run test:recipes  (node --test, Node 24 strips the types natively)
// Relative import on purpose — the "@/" alias does not resolve under bare node.
import { test } from "node:test";
import assert from "node:assert/strict";
import { matchFromSaved } from "./recipes.ts";
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

test("diet toggles still apply to saved recipes", () => {
  const creamy = saved("Creamy Chicken Rice", ["Rice", "Chicken Breast", "Cream"]);
  const out = matchFromSaved([creamy, friedRice], PANTRY, {
    ...OPTIONS,
    lactoseFree: true,
  }, 5);
  assert.deepEqual(out.map((r) => r.title), ["Chicken Fried Rice"]);
});

test("the limit caps how many slots kept recipes take", () => {
  const rows = [friedRice, saved("Chicken Rice Bowl", ["Rice", "Chicken Breast"])];
  assert.equal(matchFromSaved(rows, PANTRY, OPTIONS, 1).length, 1);
});
