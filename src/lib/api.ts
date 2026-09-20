/**
 * How many writes are in flight right now, and how many have ever started.
 *
 * Background polling needs both. The count answers "is someone mid-edit, so
 * hold off"; the sequence answers the nastier one — a poll that left before a
 * delete and lands after it carries pre-delete truth, and applying it
 * resurrects the row the user just swiped away. Comparing the sequence across
 * the fetch catches exactly that case.
 *
 * Counting here rather than at each call site means every mutation the app
 * grows later is covered without anyone remembering to opt in.
 */
let inFlight = 0;
let started = 0;

export function api(path: string, init?: RequestInit): Promise<Response> {
  const method = init?.method?.toUpperCase();
  if (!method || method === "GET" || method === "HEAD") {
    return fetch(path, init);
  }

  inFlight++;
  started++;
  return fetch(path, init).finally(() => {
    inFlight--;
  });
}

/** True while any write is outstanding. */
export function writesInFlight(): boolean {
  return inFlight > 0;
}

/** Ticks up as each write begins. Only ever compared against itself. */
export function writeSeq(): number {
  return started;
}
