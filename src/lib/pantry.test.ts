// Run: npm run test:pantry  (node --test, Node 24 strips the types natively)
// Relative import on purpose — the "@/" alias does not resolve under bare node.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  matchKey,
  mergeAliases,
  normalizeItemName,
  planMerge,
  toPantryRows,
} from "./normalize.ts";

/** Test helper: build the {name, aliases} shape matchKey expects. */
const pantry = (...rows: Array<string | [string, string[]]>) =>
  rows.map((r) =>
    typeof r === "string" ? { name: r, aliases: [] } : { name: r[0], aliases: r[1] }
  );

test("collapses case and whitespace", () => {
  assert.equal(normalizeItemName("  Bananas  "), "banana");
  assert.equal(normalizeItemName("OLIVE OIL"), "olive oil");
});

test("strips receipt cruft: PLU codes, weights, punctuation", () => {
  assert.equal(normalizeItemName("BANANAS ORGANIC 4011"), "banana organic");
  assert.equal(normalizeItemName("Milk, 2%"), "milk");
  assert.equal(normalizeItemName("EGGS  LG  GRADE-A  12CT"), "egg lg grade a ct");
});

test("camelCase from the model splits into words, not one welded key", () => {
  // The model occasionally answers "oliveOil"; lowercasing first would make
  // "oliveoil", which never matches the receipt's "olive oil".
  assert.equal(normalizeItemName("oliveOil"), "olive oil");
  assert.equal(normalizeItemName("paperTowels"), "paper towel");
  assert.equal(normalizeItemName("oliveOil"), normalizeItemName("Olive Oil"));
  assert.equal(normalizeItemName("greekYogurt"), normalizeItemName("Greek Yogurt"));
});

test("separators all normalize to the same key", () => {
  const expected = "green onion";
  for (const form of ["green onion", "Green-Onion", "green_onion", "greenOnion"]) {
    assert.equal(normalizeItemName(form), expected, form);
  }
});

test("plural forms collapse onto the singular key", () => {
  // This is the whole point: a receipt says one thing, you say another.
  assert.equal(normalizeItemName("Bananas"), normalizeItemName("banana"));
  assert.equal(normalizeItemName("Peaches"), normalizeItemName("peach"));
  assert.equal(normalizeItemName("Blueberries"), normalizeItemName("blueberry"));
  assert.equal(normalizeItemName("Green Beans"), "green bean");
});

test("does not over-strip words that legitimately end in s", () => {
  assert.equal(normalizeItemName("hummus"), "hummus"); // -us, not a plural
  assert.equal(normalizeItemName("couscous"), "couscous");
  assert.equal(normalizeItemName("rice"), "rice");
  assert.equal(normalizeItemName("oats"), "oat"); // acceptable: stable both ways
});

test("short words are left alone", () => {
  assert.equal(normalizeItemName("gas"), "gas");
});

test("empty and junk input yields an empty key, not a bad row", () => {
  assert.equal(normalizeItemName(""), "");
  assert.equal(normalizeItemName("   "), "");
  assert.equal(normalizeItemName("$4.99"), "");
});

test("rows carry the status and keep the display label and quantity", () => {
  const rows = toPantryRows(
    [{ name: "banana", label: "Bananas", quantity: "2.4 lb" }],
    "available",
    "receipt"
  );
  assert.deepEqual(rows, [
    {
      name: "banana",
      label: "Bananas",
      quantity: "2.4 lb",
      status: "available",
      source: "receipt",
    },
  ]);
});

test("a receipt listing the same item twice becomes one row", () => {
  const rows = toPantryRows(
    [
      { name: "banana", label: "Bananas", quantity: "1 lb" },
      { name: "Bananas", label: "Bananas", quantity: "2 lb" },
    ],
    "available",
    "receipt"
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].quantity, "2 lb"); // last line wins
});

test("junk lines are dropped rather than written as blank rows", () => {
  const rows = toPantryRows(
    [
      { name: "$4.99", label: "$4.99" },
      { name: "", label: "" },
      { name: "milk", label: "Milk" },
    ],
    "available",
    "receipt"
  );
  assert.deepEqual(rows.map((r) => r.name), ["milk"]);
});

test("quantity is cleared when an item moves to the shopping list", () => {
  const rows = toPantryRows([{ name: "banana", label: "Bananas" }], "needed", "message");
  assert.equal(rows[0].quantity, null);
  assert.equal(rows[0].status, "needed");
});

test("a loosely-spoken name resolves onto the item already in the pantry", () => {
  const rows = pantry("greek yogurt", "banana", "olive oil");
  // "the kids finished the yogurt" should clear the greek yogurt row.
  assert.deepEqual(matchKey("yogurt", rows), { name: "greek yogurt", via: "subset" });
  // And the reverse direction, when the receipt was the vaguer of the two.
  assert.deepEqual(matchKey("extra virgin olive oil", rows), {
    name: "olive oil",
    via: "subset",
  });
});

test("an exact match always wins over any looser resolution", () => {
  assert.deepEqual(matchKey("yogurt", pantry("yogurt", "greek yogurt")), {
    name: "yogurt",
    via: "exact",
  });
});

test("an ambiguous name gets its own row instead of a wrong guess", () => {
  // "milk" could mean either; guessing would clear the wrong one.
  assert.deepEqual(matchKey("milk", pantry("whole milk", "oat milk")), {
    name: "milk",
    via: "none",
  });
});

test("unrelated items never resolve onto each other", () => {
  assert.equal(matchKey("saffron", pantry("banana", "greek yogurt")).via, "none");
  assert.equal(matchKey("", pantry("banana")).via, "none");
});

test("an alias reaches a synonym that shares no words", () => {
  // The whole reason the alias column exists: word-subset cannot get here.
  const rows = pantry(["half and half", ["creamer", "coffee creamer"]], "banana");
  assert.deepEqual(matchKey("creamer", rows), { name: "half and half", via: "alias" });
  assert.equal(matchKey("creamer", pantry("half and half")).via, "none");
});

test("aliases lose to an exact name and win over a word-subset match", () => {
  const rows = pantry(["green onion", ["scallion"]], "onion");
  assert.equal(matchKey("scallion", rows).name, "green onion");
  // "onion" is exact on its own row, so it must not be pulled into green onion.
  assert.deepEqual(matchKey("onion", rows), { name: "onion", via: "exact" });
});

test("an alias claimed by two items is treated as ambiguous", () => {
  const rows = pantry(["whole milk", ["milk"]], ["oat milk", ["milk"]]);
  assert.deepEqual(matchKey("milk", rows), { name: "milk", via: "none" });
});

test("merged aliases are normalized, deduped, and never the item's own name", () => {
  assert.deepEqual(
    mergeAliases("half and half", ["Creamers", "creamer"], ["HALF AND HALF"], ["cream"]),
    ["cream", "creamer"]
  );
  assert.deepEqual(mergeAliases("banana", undefined, []), []);
});

test("THE LOOP: receipt -> ran out -> receipt lands on the same key each time", () => {
  // Every hop must produce the identical `name`, or the upsert makes a
  // duplicate row instead of flipping the existing one and the whole
  // feature silently stops working.
  const fromReceipt = toPantryRows(
    [{ name: "banana", label: "BANANAS ORGANIC 4011" }],
    "available",
    "receipt"
  );
  const fromMessage = toPantryRows(
    [{ name: "bananas", label: "Bananas" }], // "we ran out of bananas"
    "needed",
    "message"
  );
  const fromNextReceipt = toPantryRows(
    [{ name: "Banana", label: "Bananas" }],
    "available",
    "receipt"
  );

  assert.equal(fromReceipt[0].name, "banana");
  assert.equal(fromMessage[0].name, "banana");
  assert.equal(fromNextReceipt[0].name, "banana");
  assert.equal(fromMessage[0].status, "needed");
  assert.equal(fromNextReceipt[0].status, "available");
});

test("merging keeps the target's label and absorbs the source as an alias", () => {
  const plan = planMerge(
    { name: "creamer", label: "Creamer", aliases: ["coffee creamer"], quantity: null },
    { name: "half and half", label: "Half & Half", aliases: [], quantity: "1 qt" }
  );
  assert.equal(plan.label, "Half & Half");
  assert.equal(plan.quantity, "1 qt");
  assert.deepEqual(plan.aliases, ["coffee creamer", "creamer"]);
});

test("merging fills in a missing quantity from the source", () => {
  const plan = planMerge(
    { name: "creamer", label: "Creamer", aliases: [], quantity: "1 qt" },
    { name: "half and half", label: "Half & Half", aliases: [], quantity: null }
  );
  assert.equal(plan.quantity, "1 qt");
});

test("a merged duplicate resolves onto the survivor next time", () => {
  // The reason merge writes the alias at all: the phrasing that caused the
  // split must stop splitting.
  const plan = planMerge(
    { name: "creamer", label: "Creamer", aliases: [], quantity: null },
    { name: "half and half", label: "Half & Half", aliases: [], quantity: null }
  );
  const survivor = { name: "half and half", aliases: plan.aliases };
  assert.deepEqual(matchKey("creamer", [survivor]), {
    name: "half and half",
    via: "alias",
  });
});

test("THE LOOP via alias: buy half & half, run out of 'creamer', buy again", () => {
  // No shared words anywhere in this chain — only the alias column connects it.
  const stocked = { name: "half and half", aliases: ["creamer"] };

  const spoken = matchKey(normalizeItemName("creamer"), [stocked]);
  assert.deepEqual(spoken, { name: "half and half", via: "alias" });

  // Next receipt lands on that same row, clearing it off the shopping list.
  const rescanned = matchKey(normalizeItemName("Half & Half"), [stocked]);
  assert.equal(rescanned.name, "half and half");
});
