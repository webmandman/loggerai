// Relative imports on purpose, same as recipes.ts: the "@/" alias does not
// resolve under the bare `node --test` run.
import { parseLocalDate, toLocalDateStr } from "./utils.ts";

/** The day parts a plan has slots for, in the order they are eaten. */
export const MEAL_SLOTS = ["breakfast", "lunch", "dinner"] as const;

/**
 * Move a "YYYY-MM-DD" key forward or back by whole days.
 *
 * Goes through parseLocalDate, which anchors at noon, so a ±1 across a DST
 * boundary lands on the next calendar day rather than 23 hours later on the
 * same one. A key that will not parse is returned untouched — the caller is
 * holding a date the rest of the page cannot render anyway.
 */
export function shiftDateStr(key: string, days: number): string {
  const date = parseLocalDate(key);
  if (!date) return key;
  date.setDate(date.getDate() + days);
  return toLocalDateStr(date);
}

/**
 * What to show above the day's meals.
 *
 * The three days either side of today read as words, because that is how
 * people talk about dinner. Anything further out gets a real date, since
 * "in 4 days" is harder to place than "Wed, Sep 24".
 */
export function dayLabel(key: string, today: string): string {
  const date = parseLocalDate(key);
  if (!date) return key;

  const diff = daysBetween(today, key);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";

  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

/** Whole days from `from` to `to`, both "YYYY-MM-DD". */
export function daysBetween(from: string, to: string): number {
  const a = parseLocalDate(from);
  const b = parseLocalDate(to);
  if (!a || !b) return 0;
  // Both are noon-anchored, so a DST shift of an hour cannot flip the rounding.
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}
