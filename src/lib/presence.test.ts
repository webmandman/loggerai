import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  describePath,
  describePresence,
  firstName,
  getActivity,
  isOnline,
  ONLINE_WINDOW_MS,
  setActivity,
} from "./presence.ts";

test("describePath prefers the more specific route", () => {
  // /recipes/preferences must not be swallowed by the /recipes prefix.
  assert.equal(describePath("/recipes/preferences"), "editing food preferences");
  assert.equal(describePath("/recipes"), "looking at recipes");
  assert.equal(describePath("/pantry"), "updating the pantry");
  assert.equal(describePath("/plan"), "planning meals");
  assert.equal(describePath("/"), "writing something down");
});

test("describePath never leaks a raw path", () => {
  assert.equal(describePath("/something-new"), "poking around");
  assert.equal(describePath(""), "poking around");
});

test("a reported activity outranks the route", () => {
  assert.equal(describePresence("/pantry", "scanning a receipt"), "scanning a receipt");
  assert.equal(describePresence("/pantry", null), "updating the pantry");
  // Whitespace is not an activity.
  assert.equal(describePresence("/pantry", "   "), "updating the pantry");
});

test("isOnline counts three missed beats as gone", () => {
  const now = 1_000_000;
  assert.equal(isOnline(now, now), true);
  assert.equal(isOnline(now - ONLINE_WINDOW_MS + 1, now), true);
  assert.equal(isOnline(now - ONLINE_WINDOW_MS, now), false);
  assert.equal(isOnline(now - 60_000, now), false);
});

test("firstName takes the first word and survives nothing", () => {
  assert.equal(firstName("Ada Lovelace"), "Ada");
  assert.equal(firstName("Ada"), "Ada");
  assert.equal(firstName(null), "Someone");
  assert.equal(firstName("   "), "Someone");
});

test("activity round-trips and clears", () => {
  setActivity("scanning a receipt");
  assert.equal(getActivity(), "scanning a receipt");
  setActivity(null);
  assert.equal(getActivity(), null);
});
