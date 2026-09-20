// Run: npm run test:classify-entry  (node --test, Node 24 strips the types natively)
// Relative import on purpose — the "@/" alias does not resolve under bare node.
//
// Covers the shape of the questions and how the answers are read back. Whether
// a given entry is a "task" or a "reminder" is the model's call and is checked
// against labelled entries by `npm run eval`, not here.
import { test } from "node:test";
import assert from "node:assert/strict";
import { MOODS, QUESTIONS, readClassification } from "./classify-entry.ts";
import { CATEGORIES } from "../types/index.ts";

const pick = (choice: string) =>
  ({ type: "choice", choice, confidence: 0.9, probabilities: {} }) as const;

const answers = (category: string, mood: string) =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ({ category: pick(category), mood: pick(mood) }) as any;

test("every category the app can store is on the ballot, and nothing else", () => {
  // The feed filter, the badge colours and the digest all key off CATEGORIES.
  // A criterion the app has no colour for would render as an unstyled chip;
  // a category missing from the ballot could never be chosen again.
  assert.deepEqual(Object.keys(QUESTIONS.category.criteria).sort(), [...CATEGORIES].sort());
});

test("the moods are the five, with no separate way of saying none", () => {
  // A "none" option was on the ballot in the first version and the eval showed
  // the model never once picked it: "neutral" already means the same thing, so
  // the two just split the probability. `neutral` carries it now.
  assert.deepEqual(Object.keys(QUESTIONS.mood.criteria).sort(), [...MOODS].sort());
  assert.ok(!("none" in QUESTIONS.mood.criteria));
});

test("a category and a mood come straight back", () => {
  assert.deepEqual(readClassification(answers("meeting", "frustrated")), {
    category: "meeting",
    mood: "frustrated",
  });
});

test("a flat entry comes back neutral, which is what null used to mean", () => {
  assert.deepEqual(readClassification(answers("task", "neutral")), {
    category: "task",
    mood: "neutral",
  });
});

test("either answer missing hands the decision back rather than half-guessing", () => {
  // null tells the caller to use whatever the writing model said, which is
  // what shipped before this existed. Returning half a classification would
  // overwrite one good field and invent the other.
  assert.equal(readClassification({}), null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  assert.equal(readClassification({ mood: pick("positive") } as any), null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  assert.equal(readClassification({ category: pick("grocery") } as any), null);
});

test("note and other are on the ballot, so there is nothing to fall back to", () => {
  // This is why neither answer is gated on confidence: the model can already
  // say "I don't know which" by picking one of these, and an ungated low
  // confidence "personal" still beats the blank "note" the old catch gave.
  assert.ok("note" in QUESTIONS.category.criteria);
  assert.ok("other" in QUESTIONS.category.criteria);
});
