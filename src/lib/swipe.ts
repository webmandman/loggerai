/** How far left a row must travel before releasing means delete. */
export const SWIPE_THRESHOLD = 72;
/** Furthest the row will follow the finger. */
export const SWIPE_MAX = 112;
/** Movement before the gesture is classified at all. */
export const SWIPE_SLOP = 8;

export type SwipeIntent = "pending" | "scroll" | "swipe";

/**
 * Classify a drag before acting on it.
 *
 * Getting this wrong is the classic swipe-row bug: a slightly diagonal flick
 * gets captured as a swipe and the list refuses to scroll. Ties go to
 * scrolling, which is the gesture people make far more often.
 */
export function swipeIntent(deltaX: number, deltaY: number): SwipeIntent {
  const ax = Math.abs(deltaX);
  const ay = Math.abs(deltaY);

  if (ax < SWIPE_SLOP && ay < SWIPE_SLOP) return "pending";
  return ay >= ax ? "scroll" : "swipe";
}

/** Follow the finger leftward only, and never past the reveal width. */
export function swipeOffset(deltaX: number): number {
  return Math.max(-SWIPE_MAX, Math.min(0, deltaX));
}

/** Release past the threshold deletes; anything less snaps back. */
export function shouldDelete(offset: number): boolean {
  return offset <= -SWIPE_THRESHOLD;
}
