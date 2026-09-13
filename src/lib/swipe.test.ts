// Run: npm run test:swipe  (node --test, Node 24 strips the types natively)
// Relative import on purpose — the "@/" alias does not resolve under bare node.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SWIPE_MAX,
  SWIPE_THRESHOLD,
  shouldDelete,
  shouldMerge,
  swipeIntent,
  swipeOffset,
} from "./swipe.ts";

test("a small touch is not yet a gesture", () => {
  assert.equal(swipeIntent(0, 0), "pending");
  assert.equal(swipeIntent(5, 5), "pending");
  assert.equal(swipeIntent(-7, 3), "pending");
});

test("a clear horizontal drag is a swipe", () => {
  assert.equal(swipeIntent(-40, 3), "swipe");
  assert.equal(swipeIntent(-12, 0), "swipe");
});

test("a clear vertical drag is a scroll, never a swipe", () => {
  assert.equal(swipeIntent(2, -60), "scroll");
  assert.equal(swipeIntent(-3, 40), "scroll");
});

test("a diagonal tie goes to scrolling, not swiping", () => {
  // The classic swipe-row bug is stealing the scroll on a sloppy flick.
  // Scrolling is the far more common intent, so ties must go to it.
  assert.equal(swipeIntent(-30, 30), "scroll");
  assert.equal(swipeIntent(-30, 31), "scroll");
  assert.equal(swipeIntent(-31, 30), "swipe");
});

test("the row follows the finger in both directions", () => {
  assert.equal(swipeOffset(-50), -50);
  assert.equal(swipeOffset(0), 0);
  assert.equal(swipeOffset(50), 50);
});

test("the row stops following past the reveal width", () => {
  assert.equal(swipeOffset(-1000), -SWIPE_MAX);
  assert.equal(swipeOffset(1000), SWIPE_MAX);
});

test("release deletes only past the left threshold", () => {
  assert.equal(shouldDelete(-SWIPE_THRESHOLD), true);
  assert.equal(shouldDelete(-SWIPE_THRESHOLD - 1), true);
  assert.equal(shouldDelete(-SWIPE_THRESHOLD + 1), false);
  assert.equal(shouldDelete(0), false);
});

test("release merges only past the right threshold", () => {
  assert.equal(shouldMerge(SWIPE_THRESHOLD), true);
  assert.equal(shouldMerge(SWIPE_THRESHOLD - 1), false);
  assert.equal(shouldMerge(0), false);
});

test("the two directions never both fire", () => {
  // Destructive delete must not be reachable by a rightward swipe.
  for (const offset of [-SWIPE_MAX, -SWIPE_THRESHOLD, -1, 0, 1, SWIPE_THRESHOLD, SWIPE_MAX]) {
    assert.equal(shouldDelete(offset) && shouldMerge(offset), false);
  }
  assert.equal(shouldDelete(SWIPE_MAX), false);
  assert.equal(shouldMerge(-SWIPE_MAX), false);
});

test("a full drag always reaches the threshold in either direction", () => {
  // A capped offset that could not trigger its action would be unusable.
  assert.equal(shouldDelete(swipeOffset(-9999)), true);
  assert.equal(shouldMerge(swipeOffset(9999)), true);
});
