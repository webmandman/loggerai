/**
 * Who else is in the app and what they are doing. Kept free of React and the
 * DOM so the wording and the staleness rules can be tested directly.
 */

/** How often a client tells the server it is still here. */
export const HEARTBEAT_MS = 10_000;

/**
 * How long after someone's last heartbeat they still count as present.
 *
 * Three missed beats. Two would flicker people offline on one slow request in
 * a shop; much more and a closed tab lingers long enough to be a lie.
 */
export const ONLINE_WINDOW_MS = 30_000;

/**
 * How long an activity stays worth showing.
 *
 * Twice the heartbeat, so a viewer polling on their own schedule is certain
 * to catch it at least once, and it is gone soon after. This is what keeps
 * "added peanut butter" from sitting under a face for the rest of the
 * evening — the note is about something that just happened, and it stops
 * being true quickly.
 */
export const ACTIVITY_TTL_MS = 20_000;

/**
 * What to say someone is doing, given only the route they are on.
 *
 * Phrased as actions rather than places — "updating the pantry" answers the
 * question being asked, where "/pantry" or even "in the pantry" does not. The
 * fallback is deliberately vague rather than showing a raw path, which would
 * look like a bug to anyone who is not the person who wrote it.
 */
export function describePath(path: string): string {
  if (path === "/") return "writing something down";
  if (path.startsWith("/pantry")) return "updating the pantry";
  if (path.startsWith("/recipes/preferences")) return "editing food preferences";
  if (path.startsWith("/recipes")) return "looking at recipes";
  if (path.startsWith("/plan")) return "planning meals";
  if (path.startsWith("/feed")) return "reading the feed";
  if (path.startsWith("/insights")) return "looking at insights";
  return "poking around";
}

/**
 * Whether an activity is recent enough to still be worth showing.
 *
 * Applied on the server, where `activityAt` and `now` come from the same
 * clock. Doing it in the browser would compare a server timestamp against
 * the device's clock, and a phone a few minutes out would either hide fresh
 * notes or show stale ones.
 */
export function isActivityFresh(
  activityAt: number | null | undefined,
  now: number
): boolean {
  if (typeof activityAt !== "number") return false;
  return now - activityAt < ACTIVITY_TTL_MS;
}

/**
 * The line shown under someone's face.
 *
 * An activity wins over the route: "added peanut butter" is the thing worth
 * knowing, and while it is current the route they are on is the less
 * interesting of the two facts. Anything past its TTL has already been
 * stripped server-side, so whatever arrives here is current by construction.
 */
export function describePresence(
  path: string,
  activity: string | null | undefined
): string {
  return activity?.trim() || describePath(path);
}

/** Whether a heartbeat is recent enough to count as still being here. */
export function isOnline(lastSeen: number, now: number): boolean {
  return now - lastSeen < ONLINE_WINDOW_MS;
}

/** Just the first name — a household does not need surnames to tell people apart. */
export function firstName(name: string | null | undefined): string {
  return name?.trim().split(/\s+/)[0] || "Someone";
}

/**
 * Two kinds of activity, and the difference matters.
 *
 * `setActivity` is a state: something still happening, like a receipt being
 * scanned. Every heartbeat re-sends it, so it stays under the face until the
 * caller clears it.
 *
 * `reportAction` is an event: something that just happened, like an item
 * being added. It is sent once and forgotten. Re-sending it on every
 * heartbeat would keep refreshing its timestamp and it would never age out —
 * which is exactly the bug that makes a broadcast feel broken.
 *
 * Both live at module level rather than in React context: the heartbeat reads
 * them when it fires, so nothing has to re-render and no provider has to be
 * threaded through the tree.
 */
let ongoing: string | null = null;
let pending: string | null = null;

const listeners = new Set<() => void>();

/** Fires a heartbeat now, so a broadcast does not wait up to ten seconds. */
function notify(): void {
  listeners.forEach((fn) => fn());
}

export function onActivityChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/**
 * Report something still in progress. Only worth calling for work that lasts
 * long enough to be read — a note that flashes for 200ms is noise.
 */
export function setActivity(activity: string | null): void {
  ongoing = activity;
  notify();
}

/** Announce something that just happened, e.g. "added peanut butter". */
export function reportAction(action: string): void {
  pending = action;
  notify();
}

/**
 * What this heartbeat should send. A one-shot event is consumed here so the
 * next beat falls back to whatever is ongoing.
 */
export function takeActivity(): string | null {
  if (pending) {
    const action = pending;
    pending = null;
    return action;
  }
  return ongoing;
}

/** Test seam: drop any queued or ongoing activity. */
export function resetActivity(): void {
  ongoing = null;
  pending = null;
}
