// Run: npm run test:plan-slot  (node --test, Node 24 strips the types natively)
// Relative import on purpose — the "@/" alias does not resolve under bare node.
//
// The point of this file is the ballot. If every option on it is today or
// later, a past date cannot come back, and the repair loop that used to walk a
// stale date forward has nothing left to repair.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  NO_DAY,
  NO_MEAL,
  WINDOW,
  buildSlotQuestions,
  readSlot,
  upcomingDays,
} from "./plan-slot.ts";
import { daysBetween } from "./plan.ts";

const TODAY = "2026-09-19"; // a Saturday

const pick = (choice: string) =>
  ({ type: "choice", choice, confidence: 0.9, probabilities: {} }) as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const answers = (day: string, meal: string) =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ({ day: pick(day), meal: pick(meal) }) as any;

test("no day on the ballot is in the past — that is the whole guarantee", () => {
  for (const day of upcomingDays(TODAY)) {
    assert.ok(daysBetween(TODAY, day.key) >= 0, `${day.key} is before ${TODAY}`);
  }
});

test("the window is today plus six, consecutive", () => {
  const days = upcomingDays(TODAY);

  assert.equal(days.length, WINDOW);
  assert.equal(days[0].key, TODAY);
  days.forEach((day, i) => assert.equal(daysBetween(TODAY, day.key), i));
});

test("each weekday name appears exactly once, so none competes with itself", () => {
  // A fortnight would put two Mondays up and split the probability between
  // them, which is the same mistake as two options meaning the same thing.
  const weekdays = upcomingDays(TODAY).map((d) => d.said.split(" ").at(-3));

  assert.equal(new Set(weekdays).size, WINDOW);
});

test("the first two days are named the way people say them", () => {
  const [first, second, third] = upcomingDays(TODAY);

  assert.equal(first.said, "today, Saturday 19 September");
  assert.equal(second.said, "tomorrow, Sunday 20 September");
  assert.equal(third.said, "Monday 21 September");
});

test("the ballot carries every day plus a way to name none", () => {
  const { day, meal } = buildSlotQuestions(upcomingDays(TODAY));

  assert.equal(Object.keys(day.criteria).length, WINDOW + 1);
  assert.ok(NO_DAY in day.criteria);
  assert.deepEqual(Object.keys(meal.criteria).sort(), [
    NO_MEAL,
    "breakfast",
    "dinner",
    "lunch",
  ]);
});

// --- reading the answers -------------------------------------------------

const DAYS = upcomingDays(TODAY);

test("a day and a meal come back as the slot", () => {
  assert.deepEqual(readSlot(answers("2026-09-21", "lunch"), DAYS, TODAY), {
    date: "2026-09-21",
    meal: "lunch",
  });
});

test("a day with no meal means dinner", () => {
  assert.deepEqual(readSlot(answers("2026-09-21", NO_MEAL), DAYS, TODAY), {
    date: "2026-09-21",
    meal: "dinner",
  });
});

test("a meal with no day means today", () => {
  assert.deepEqual(readSlot(answers(NO_DAY, "breakfast"), DAYS, TODAY), {
    date: TODAY,
    meal: "breakfast",
  });
});

test("naming neither is no plan, and the recipe still saves", () => {
  assert.equal(readSlot(answers(NO_DAY, NO_MEAL), DAYS, TODAY), null);
});

test("a day that was not on the ballot is ignored rather than trusted", () => {
  // It cannot happen through the API, which only returns a label it was given.
  // It is here because the whole guarantee rests on the date coming from the
  // list, so nothing else may reach the plan.
  assert.equal(readSlot(answers("2026-09-12", NO_MEAL), DAYS, TODAY), null);
  assert.deepEqual(readSlot(answers("2026-09-12", "lunch"), DAYS, TODAY), {
    date: TODAY,
    meal: "lunch",
  });
});

test("a missing answer is undefined, which is different from no plan", () => {
  // undefined sends the caller back to the model's own date and the repair
  // loop. null would say "they named no day", and quietly drop a plan that
  // the dictation really did contain.
  assert.equal(readSlot({}, DAYS, TODAY), undefined);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  assert.equal(readSlot({ day: pick(TODAY) } as any, DAYS, TODAY), undefined);
});
