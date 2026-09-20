// Run: npm run test:diet-check  (node --test, Node 24 strips the types natively)
// Relative import on purpose — the "@/" alias does not resolve under bare node.
//
// Covers the composition, not the model: which questions get built and how
// their probabilities turn into kept or dropped recipes. The judgment itself
// is the model's job and is not something a unit test can assert.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DROP_ABOVE,
  activeRestrictions,
  buildQuestions,
  keepByVerdicts,
} from "./diet-check.ts";
import type { Recipe, RecipeOptions } from "../types/index.ts";

const OFF: RecipeOptions = {
  meal: "dinner",
  servings: 5,
  allowedMissing: 2,
  lactoseFree: false,
  glutenFree: false,
  carbHeavy: false,
  proteinHeavy: false,
  newOnly: false,
};

function recipe(title: string): Recipe {
  return {
    title,
    description: "",
    minutes: 20,
    servings: 5,
    ingredients: [{ item: "Chicken", amount: "1 lb", have: true }],
    steps: ["cook it"],
  };
}

const yes = { type: "noul", noul: 0.97 } as const;
const no = { type: "noul", noul: 0.02 } as const;

test("only the toggles that are on get asked about", () => {
  assert.deepEqual(activeRestrictions(OFF), []);
  assert.deepEqual(activeRestrictions({ ...OFF, glutenFree: true }), ["glutenFree"]);
  assert.deepEqual(activeRestrictions({ ...OFF, lactoseFree: true, glutenFree: true }), [
    "lactoseFree",
    "glutenFree",
  ]);
});

test("one question per recipe per restriction, in a single request", () => {
  const questions = buildQuestions(3, ["lactoseFree", "glutenFree"]);

  assert.equal(Object.keys(questions).length, 6);
  assert.deepEqual(Object.keys(questions).sort(), [
    "dairy0",
    "dairy1",
    "dairy2",
    "gluten0",
    "gluten1",
    "gluten2",
  ]);
  assert.equal(questions.dairy2.type, "noul");
});

test("each question names the recipe it is about", () => {
  const questions = buildQuestions(2, ["lactoseFree"]);

  assert.match(String(questions.dairy0.instructions), /`recipes\[0\]`/);
  assert.match(String(questions.dairy1.instructions), /`recipes\[1\]`/);
});

test("a yes drops that recipe and leaves its neighbours alone", () => {
  const recipes = [recipe("Fried Rice"), recipe("Fettuccine Alfredo"), recipe("Roast Chicken")];

  const out = keepByVerdicts(recipes, ["lactoseFree"], {
    dairy0: no,
    dairy1: yes,
    dairy2: no,
  });

  assert.deepEqual(
    out.map((r) => r.title),
    ["Fried Rice", "Roast Chicken"]
  );
});

test("breaking either restriction is enough to drop a recipe", () => {
  const recipes = [recipe("Buttered Toast"), recipe("Grilled Fish")];

  const out = keepByVerdicts(recipes, ["lactoseFree", "glutenFree"], {
    dairy0: no,
    gluten0: yes,
    dairy1: no,
    gluten1: no,
  });

  assert.deepEqual(
    out.map((r) => r.title),
    ["Grilled Fish"]
  );
});

test("the bar sits inside the gap the live model actually leaves", () => {
  // From six hand-labelled recipes against jev-1.13.0: nothing safe came back
  // above 0.11, nothing unsafe below 0.87. The bar has to separate those two
  // and must not sit under the safe floor — an earlier 0.15 did, and threw
  // away a dish with nothing wrong with it.
  const recipes = [recipe("Grilled Salmon")];
  const safeFloor = { type: "noul", noul: 0.11 } as const;
  const unsafeFloor = { type: "noul", noul: 0.87 } as const;

  assert.ok(DROP_ABOVE > 0.11 && DROP_ABOVE < 0.87, "the bar must fall in the gap");
  assert.equal(keepByVerdicts(recipes, ["lactoseFree"], { dairy0: safeFloor }).length, 1);
  assert.equal(keepByVerdicts(recipes, ["lactoseFree"], { dairy0: unsafeFloor }).length, 0);
});

test("an answer that never arrived drops the recipe", () => {
  // There is no second opinion to fall back on for a single dish: the word
  // list passes the ones that matter, so an unaccounted-for answer is a drop.
  const recipes = [recipe("Fried Rice")];

  assert.equal(keepByVerdicts(recipes, ["lactoseFree"], {}).length, 0);
});
