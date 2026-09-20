import { strict as assert } from "node:assert";
import { test } from "node:test";
import { dayLabel, daysBetween, shiftDateStr } from "./plan.ts";

test("shiftDateStr crosses month and year boundaries", () => {
  assert.equal(shiftDateStr("2026-09-19", 1), "2026-09-20");
  assert.equal(shiftDateStr("2026-09-19", -1), "2026-09-18");
  assert.equal(shiftDateStr("2026-09-30", 1), "2026-10-01");
  assert.equal(shiftDateStr("2026-01-01", -1), "2025-12-31");
  assert.equal(shiftDateStr("2028-02-28", 1), "2028-02-29"); // leap year
});

test("shiftDateStr steps one calendar day across a DST change", () => {
  // US DST starts 2026-03-08. Noon anchoring is what keeps this a day.
  assert.equal(shiftDateStr("2026-03-07", 1), "2026-03-08");
  assert.equal(shiftDateStr("2026-03-08", 1), "2026-03-09");
  assert.equal(shiftDateStr("2026-11-01", -1), "2026-10-31");
});

test("shiftDateStr leaves an unparseable key alone", () => {
  assert.equal(shiftDateStr("not-a-date", 1), "not-a-date");
});

test("daysBetween is signed and DST-proof", () => {
  assert.equal(daysBetween("2026-09-19", "2026-09-19"), 0);
  assert.equal(daysBetween("2026-09-19", "2026-09-22"), 3);
  assert.equal(daysBetween("2026-09-22", "2026-09-19"), -3);
  assert.equal(daysBetween("2026-03-07", "2026-03-09"), 2);
});

test("dayLabel words the near days and dates the rest", () => {
  assert.equal(dayLabel("2026-09-19", "2026-09-19"), "Today");
  assert.equal(dayLabel("2026-09-20", "2026-09-19"), "Tomorrow");
  assert.equal(dayLabel("2026-09-18", "2026-09-19"), "Yesterday");
  assert.match(dayLabel("2026-09-23", "2026-09-19"), /Sep/);
});
