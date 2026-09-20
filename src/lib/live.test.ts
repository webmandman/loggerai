import { strict as assert } from "node:assert";
import { test } from "node:test";
import { isStale, shouldPoll } from "./live.ts";

test("polls only a visible, idle, unpaused tab", () => {
  assert.equal(shouldPoll("visible", false, false), true);
  assert.equal(shouldPoll("hidden", false, false), false);
  assert.equal(shouldPoll("visible", true, false), false);
  assert.equal(shouldPoll("visible", false, true), false);
});

test("a write in flight outranks visibility", () => {
  // The pocket case and the mid-edit case must not cancel out into a poll.
  assert.equal(shouldPoll("hidden", true, false), false);
  assert.equal(shouldPoll("visible", true, true), false);
});

test("a response is stale only when a write started mid-flight", () => {
  assert.equal(isStale(4, 4), false);
  assert.equal(isStale(4, 5), true);
});

test("the stale check survives several writes during one read", () => {
  // Three swipes while a slow poll was out: still one discard, not a crash.
  assert.equal(isStale(2, 5), true);
});
