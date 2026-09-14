// Run: npm run test:diet  (node --test, Node 24 strips the types natively)
// Relative import on purpose — the "@/" alias does not resolve under bare node.
import { test } from "node:test";
import assert from "node:assert/strict";
import { filterByDiet } from "./diet.ts";
import type { Recipe, RecipeOptions } from "../types/index.ts";

const OFF: RecipeOptions = {
  meal: "dinner",
  servings: 5,
  allowedMissing: 2,
  lactoseFree: false,
  glutenFree: false,
  carbHeavy: false,
  proteinHeavy: false,
};

function recipe(title: string, items: string[]): Recipe {
  return {
    title,
    description: "",
    minutes: 20,
    servings: 5,
    ingredients: items.map((item) => ({ item, amount: "1", have: true })),
    steps: ["cook it"],
  };
}

const frittata = recipe("Spinach & Cheddar Frittata", ["Eggs", "Spinach", "Cheddar"]);
const friedRice = recipe("Chicken Fried Rice", ["Rice", "Chicken Breast", "Onion"]);
const pasta = recipe("Tomato Pasta", ["Spaghetti", "Canned Tomatoes", "Garlic"]);

test("with every toggle off, nothing is filtered", () => {
  const out = filterByDiet([frittata, friedRice, pasta], OFF);
  assert.equal(out.length, 3);
});

test("lactose free drops the cheddar frittata the model really returned", () => {
  const out = filterByDiet([frittata, friedRice], { ...OFF, lactoseFree: true });
  assert.deepEqual(
    out.map((r) => r.title),
    ["Chicken Fried Rice"]
  );
});

test("gluten free drops the pasta", () => {
  const out = filterByDiet([pasta, friedRice], { ...OFF, glutenFree: true });
  assert.deepEqual(
    out.map((r) => r.title),
    ["Chicken Fried Rice"]
  );
});

test("both toggles apply at once", () => {
  const out = filterByDiet([frittata, pasta, friedRice], {
    ...OFF,
    lactoseFree: true,
    glutenFree: true,
  });
  assert.deepEqual(
    out.map((r) => r.title),
    ["Chicken Fried Rice"]
  );
});

test("a qualified substitute survives the filter", () => {
  const safe = recipe("Creamy Oats", ["Oats", "Lactose-Free Milk", "Honey"]);
  const glutenSafe = recipe("Baked Ziti", ["Gluten Free Pasta", "Canned Tomatoes"]);

  assert.equal(filterByDiet([safe], { ...OFF, lactoseFree: true }).length, 1);
  assert.equal(filterByDiet([glutenSafe], { ...OFF, glutenFree: true }).length, 1);
});

test("the ban matches inside a longer ingredient name", () => {
  const sneaky = recipe("Creamy Chicken", ["Chicken Breast", "Heavy Cream"]);
  assert.equal(filterByDiet([sneaky], { ...OFF, lactoseFree: true }).length, 0);
});

test("carb and protein toggles never filter — they only steer the prompt", () => {
  const out = filterByDiet([frittata, pasta], {
    ...OFF,
    carbHeavy: true,
    proteinHeavy: true,
  });
  assert.equal(out.length, 2);
});
