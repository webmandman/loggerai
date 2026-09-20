import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  ACTIVITY_TTL_MS,
  describePath,
  describePresence,
  firstName,
  IDLE_AFTER_MS,
  isActivityFresh,
  isIdle,
  isOnline,
  ONLINE_WINDOW_MS,
  reportAction,
  resetActivity,
  setActivity,
  takeActivity,
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

test("an activity outranks the route", () => {
  assert.equal(
    describePresence("/pantry", "added peanut butter"),
    "added peanut butter"
  );
  assert.equal(describePresence("/pantry", null), "updating the pantry");
  // Whitespace is not an activity.
  assert.equal(describePresence("/pantry", "   "), "updating the pantry");
});

test("an activity goes stale at the TTL boundary", () => {
  const now = 1_000_000;
  assert.equal(isActivityFresh(now, now), true);
  assert.equal(isActivityFresh(now - ACTIVITY_TTL_MS + 1, now), true);
  assert.equal(isActivityFresh(now - ACTIVITY_TTL_MS, now), false);
  assert.equal(isActivityFresh(now - 60_000, now), false);
});

test("an activity with no timestamp is never fresh", () => {
  // A row written before activityAt existed must not claim to be current.
  assert.equal(isActivityFresh(null, 1_000_000), false);
  assert.equal(isActivityFresh(undefined, 1_000_000), false);
});

test("isIdle needs two quiet minutes", () => {
  const now = 1_000_000;
  assert.equal(isIdle(now, now), false);
  assert.equal(isIdle(now - IDLE_AFTER_MS + 1, now), false);
  assert.equal(isIdle(now - IDLE_AFTER_MS, now), true);
});

test("someone who just arrived is active, not idle", () => {
  // No recorded interaction must not read as "quiet since the epoch".
  assert.equal(isIdle(null, 1_000_000), false);
  assert.equal(isIdle(0, 1_000_000), false);
  assert.equal(isIdle(undefined, 1_000_000), false);
});

test("isOnline counts three missed beats as gone", () => {
  const now = 1_000_000;
  assert.equal(isOnline(now, now), true);
  assert.equal(isOnline(now - ONLINE_WINDOW_MS + 1, now), true);
  assert.equal(isOnline(now - ONLINE_WINDOW_MS, now), false);
});

test("firstName takes the first word and survives nothing", () => {
  assert.equal(firstName("Laila Mejia"), "Laila");
  assert.equal(firstName("Laila"), "Laila");
  assert.equal(firstName(null), "Someone");
  assert.equal(firstName("   "), "Someone");
});

test("an ongoing activity repeats on every beat", () => {
  resetActivity();
  setActivity("scanning a receipt");
  assert.equal(takeActivity(), "scanning a receipt");
  // Still scanning, so the next beat must say so again.
  assert.equal(takeActivity(), "scanning a receipt");
  setActivity(null);
  assert.equal(takeActivity(), null);
});

test("a reported action is sent once and then forgotten", () => {
  resetActivity();
  reportAction("added peanut butter");
  assert.equal(takeActivity(), "added peanut butter");
  // This is the whole point: repeating it would keep refreshing its
  // timestamp server-side and it would never age out.
  assert.equal(takeActivity(), null);
});

test("an action jumps the queue, then the ongoing state resumes", () => {
  resetActivity();
  setActivity("scanning a receipt");
  reportAction("stocked 12 items");
  assert.equal(takeActivity(), "stocked 12 items");
  assert.equal(takeActivity(), "scanning a receipt");
});
