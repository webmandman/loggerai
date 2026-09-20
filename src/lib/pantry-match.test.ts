// Run: npm run test:pantry-match  (node --test, Node 24 strips the types natively)
// Relative import on purpose — the "@/" alias does not resolve under bare node.
//
// Covers what gets asked and how the answers are read back, not the judgment
// itself. The matching passes that run before any of this are matchKey's, and
// pantry.test.ts already owns those.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MERGE_ABOVE,
  NONE_OF_THESE,
  buildMatchQuestions,
  chooseMatches,
} from "./pantry-match.ts";
import { normalizeItemName } from "./normalize.ts";

const PANTRY = [
  { name: "whole milk", aliases: [] },
  { name: "oat milk", aliases: [] },
  { name: "half and half", aliases: ["creamer"] },
];

/**
 * A Choice answer with `mass` on the picked row and the rest on "none".
 *
 * `confidence` is set to a value that would flip the verdict if anything still
 * read it, which is the point: the gate moved off confidence after it was
 * measured overlapping on live data.
 */
const picked = (choice: string, mass: number) =>
  ({
    type: "choice",
    choice,
    confidence: 0.99,
    probabilities: { [choice]: mass, [NONE_OF_THESE]: 1 - mass },
  }) as const;

test("the way out can never collide with a real pantry key", () => {
  // Every stored name goes through normalizeItemName, which leaves only
  // lowercase letters and spaces. The sentinel survives neither.
  assert.notEqual(normalizeItemName(NONE_OF_THESE), NONE_OF_THESE);
});

test("one question per unresolved name, whatever the pantry size", () => {
  const questions = buildMatchQuestions(["creamer", "romaine"], PANTRY);

  assert.deepEqual(Object.keys(questions), ["item0", "item1"]);
  assert.equal(questions.item0.type, "choice");
});

test("every pantry row is on the ballot, plus a way out", () => {
  const { item0 } = buildMatchQuestions(["romaine"], PANTRY);

  assert.deepEqual(Object.keys(item0.criteria).sort(), [
    NONE_OF_THESE,
    "half and half",
    "oat milk",
    "whole milk",
  ]);
});

test("an item's stored aliases ride along as its description", () => {
  const { item0 } = buildMatchQuestions(["creamer"], PANTRY);

  assert.deepEqual(item0.criteria["half and half"], { alsoCalled: ["creamer"] });
  assert.equal(item0.criteria["oat milk"], null);
});

test("each question names the food it is about", () => {
  const { item0, item1 } = buildMatchQuestions(["romaine", "scallion"], PANTRY);

  assert.equal((item0.instructions as { heard: string }).heard, "romaine");
  assert.equal((item1.instructions as { heard: string }).heard, "scallion");
});

test("a confident pick resolves onto that row", () => {
  const out = chooseMatches(["creamer"], { item0: picked("half and half", 0.96) });

  assert.deepEqual([...out], [["creamer", "half and half"]]);
});

test("a split distribution writes its own row rather than guessing", () => {
  // "milk" caught between whole and oat: no row holds half the mass, so a
  // duplicate beats clearing the wrong thing off the shopping list.
  const out = chooseMatches(["milk"], {
    item0: {
      type: "choice",
      choice: "whole milk",
      confidence: 0.95,
      probabilities: { "whole milk": 0.34, "oat milk": 0.33, [NONE_OF_THESE]: 0.33 },
    },
  });

  assert.equal(out.size, 0);
});

test("the verdict reads the mass on the pick, not the confidence", () => {
  // Measured on live data: a true match and a true new row both came back at
  // 0.65 confidence. Anything gating on that number decides these two alike.
  const out = chooseMatches(["yoghurt"], {
    item0: {
      type: "choice",
      choice: "greek yogurt",
      confidence: 0.65,
      probabilities: { "greek yogurt": 0.7, [NONE_OF_THESE]: 0.3 },
    },
  });

  assert.deepEqual([...out], [["yoghurt", "greek yogurt"]]);
});

test("the model saying none is taken at its word", () => {
  const out = chooseMatches(["saffron"], { item0: picked(NONE_OF_THESE, 0.99) });

  assert.equal(out.size, 0);
});

test("an answer that never arrived writes its own row", () => {
  assert.equal(chooseMatches(["romaine"], {}).size, 0);
});

test("the bar sits under the floor real matches came back at", () => {
  // Live true matches held 0.70 to 0.95 of the mass on the row they picked.
  // The bar has to clear everything below that without reaching up into it.
  assert.ok(MERGE_ABOVE < 0.7, "a real match must not be thrown away");

  const out = chooseMatches(["creamer", "romaine"], {
    item0: picked("half and half", MERGE_ABOVE),
    item1: picked("whole milk", MERGE_ABOVE - 0.01),
  });

  assert.deepEqual([...out.keys()], ["creamer"]);
});
