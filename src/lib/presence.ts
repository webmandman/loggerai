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
 * The line shown under someone's face.
 *
 * A reported activity wins over the route: "scanning a receipt" is worth
 * saying, and while it is happening the route they are on is the less
 * interesting of the two facts.
 */
export function describePresence(path: string, activity?: string | null): string {
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
 * The activity a client is currently reporting.
 *
 * A module-level value rather than React context on purpose: the heartbeat
 * reads it when it fires, so nothing needs to re-render when it changes and
 * no provider has to be threaded through the tree. Callers set it around a
 * slow operation and clear it after.
 */
let current: string | null = null;

/**
 * Report what this person is doing. Only worth calling for something that
 * lasts long enough to be read — a note that flashes for 200ms is noise.
 */
export function setActivity(activity: string | null): void {
  current = activity;
}

export function getActivity(): string | null {
  return current;
}
