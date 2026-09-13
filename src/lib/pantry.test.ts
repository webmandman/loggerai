// Run: npm run test:pantry  (node --test, Node 24 strips the types natively)
// Relative import on purpose — the "@/" alias does not resolve under bare node.
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeItemName, resolveKey, toPantryRows } from "./normalize.ts";

test("collapses case and whitespace", () => {
  assert.equal(normalizeItemName("  Bananas  "), "banana");
  assert.equal(normalizeItemName("OLIVE OIL"), "olive oil");
});

test("strips receipt cruft: PLU codes, weights, punctuation", () => {
  assert.equal(normalizeItemName("BANANAS ORGANIC 4011"), "banana organic");
  assert.equal(normalizeItemName("Milk, 2%"), "milk");
  assert.equal(normalizeItemName("EGGS  LG  GRADE-A  12CT"), "egg lg grade a ct");
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
  const pantry = ["greek yogurt", "banana", "olive oil"];
  // "the kids finished the yogurt" should clear the greek yogurt row.
  assert.equal(resolveKey("yogurt", pantry), "greek yogurt");
  // And the reverse direction, when the receipt was the vaguer of the two.
  assert.equal(resolveKey("extra virgin olive oil", pantry), "olive oil");
});

test("an exact match always wins over any alias resolution", () => {
  assert.equal(resolveKey("yogurt", ["yogurt", "greek yogurt"]), "yogurt");
});

test("an ambiguous name gets its own row instead of a wrong guess", () => {
  // "milk" could mean either; guessing would clear the wrong one.
  assert.equal(resolveKey("milk", ["whole milk", "oat milk"]), "milk");
});

test("unrelated items never resolve onto each other", () => {
  assert.equal(resolveKey("saffron", ["banana", "greek yogurt"]), "saffron");
  assert.equal(resolveKey("", ["banana"]), "");
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
