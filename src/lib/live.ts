/**
 * The decisions behind background refreshing, kept free of React and the DOM
 * so they can be tested directly. The hook in use-live.ts supplies the inputs.
 */

/**
 * How often a visible tab re-reads shared state.
 *
 * Ten seconds is picked for the shape of the problem, not the network: two
 * people editing the same grocery list from different rooms want to see each
 * other within a breath or two of looking up, and nobody is watching the
 * screen waiting. Faster burns invocations on a list that changes a few times
 * a minute at most.
 */
export const POLL_INTERVAL_MS = 10_000;

/**
 * Whether a scheduled refresh should actually fire.
 *
 * Hidden tabs are skipped because a phone in a pocket has nobody reading it,
 * and the refresh on becoming visible covers the catch-up. Writes are skipped
 * because the server has not heard the local edit yet, so its answer is the
 * older of the two.
 */
export function shouldPoll(
  visibility: string,
  writing: boolean,
  paused: boolean
): boolean {
  return visibility === "visible" && !writing && !paused;
}

/**
 * Whether a response that has just arrived is already out of date.
 *
 * True when a write began while the read was in flight: that write knows
 * something this response does not, so the response gets dropped rather than
 * painted over newer local state.
 */
export function isStale(seqAtRequest: number, seqNow: number): boolean {
  return seqNow !== seqAtRequest;
}
