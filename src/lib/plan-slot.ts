/**
 * Which day part a dictated recipe is meant for.
 *
 * The old arrangement asked the model to resolve the day itself and return a
 * YYYY-MM-DD, then repaired the answer:
 *
 *   for (let i = 0; i < 2 && daysBetween(today, date) < 0; i++)
 *     date = shiftDateStr(date, 7);
 *
 * That loop is there because the model resolves "Monday" to the Monday just
 * gone often enough to matter, and nobody dictating dinner means a slot in the
 * past. It works, but it is a repair: the wrong answer is produced first and
 * patched afterwards, and a date two weeks stale still slips through as a
 * dropped plan.
 *
 * Here the calendar belongs to code. It works out the days a person could
 * plausibly mean, forward from today by construction, and the judgment only
 * picks one of them. A date in the past is not on the ballot, so it cannot be
 * returned, and there is nothing left to repair.
 *
 * The window is seven days, today and the six after it, and that number is
 * exact rather than round: seven consecutive days name each weekday once, so
 * no weekday is ever on the ballot twice competing with itself. Eight would
 * put today's weekday up again at the far end — the first version did, and the
 * test caught it. It also matches what the old prompt asked for in words: a
 * weekday name means the next time it comes round, and if today is that
 * weekday, it means today.
 *
 * ponytail: "a week on Monday" falls off the end and lands wherever the model
 * puts it. Widening means labels that tell two Mondays apart, which is a
 * harder question than it looks; worth it only if anyone plans that far out.
 *
 * Relative imports on purpose: the "@/" alias does not resolve under the bare
 * `node --test` run.
 */
import { TypeSafeClient, choice, type SystemOneResult } from "@typesafe-ai/sdk";
import { MEAL_SLOTS, shiftDateStr } from "./plan.ts";
import { parseLocalDate } from "./utils.ts";
import type { Meal } from "@/types";

/** Chosen when the speaker named no day, and no meal, respectively. */
export const NO_DAY = "NO_DAY";
export const NO_MEAL = "NO_MEAL";

/** How many days go on the ballot: today and the six after it, one per weekday. */
export const WINDOW = 7;

export interface DayOption {
  /** The date key, which is also the option label the model picks. */
  key: string;
  /** How a person would say it, e.g. "tomorrow, Sunday 21 September". */
  said: string;
}

// Spelled out rather than taken from toLocaleDateString, which follows the
// server's locale — these go to a model and must read the same everywhere.
const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/**
 * The days a dictation could mean, starting at today.
 *
 * Every one is today or later, which is the whole point: the model is choosing
 * from this list, so it has no way to name yesterday.
 */
export function upcomingDays(today: string, count = WINDOW): DayOption[] {
  const days: DayOption[] = [];

  for (let i = 0; i < count; i++) {
    const key = i === 0 ? today : shiftDateStr(today, i);
    const date = parseLocalDate(key);
    if (!date) break; // an unparseable `today` has nothing to count from

    const named = `${WEEKDAYS[date.getDay()]} ${date.getDate()} ${MONTHS[date.getMonth()]}`;
    const prefix = i === 0 ? "today, " : i === 1 ? "tomorrow, " : "";
    days.push({ key, said: `${prefix}${named}` });
  }

  return days;
}

/** The two questions, built around a specific day's ballot. */
export function buildSlotQuestions(days: DayOption[]) {
  const dayCriteria: Record<string, string> = {};
  for (const day of days) dayCriteria[day.key] = day.said;
  dayCriteria[NO_DAY] =
    "They did not say when to eat it. They dictated the dish and nothing about a day.";

  return {
    day: choice(
      {
        question: "Which day did the speaker say they want to eat this?",
        note: 'Everything they could mean is listed. "Tonight" is today; a weekday name means the next time that weekday comes round, which is the only one on the list.',
        several: "If they named more than one, take the first one they said.",
      },
      dayCriteria
    ),
    meal: choice(
      {
        question: "Which meal did the speaker name?",
        note: "Only what they actually said. A day on its own does not imply a meal.",
      },
      {
        breakfast: null,
        lunch: null,
        dinner: null,
        [NO_MEAL]: "They named no meal — either a bare day, or nothing about when at all.",
      }
    ),
  };
}

export interface Slot {
  date: string;
  meal: Meal;
}

/**
 * The answer, or a reason there is none.
 *
 * `null` is the speaker naming no slot, which is an answer. `undefined` is not
 * having been able to ask, which sends the caller back to the model's own
 * planDate and the repair loop it still carries.
 */
export type SlotResult = Slot | null | undefined;

type Answers = Partial<
  SystemOneResult<ReturnType<typeof buildSlotQuestions>>["answers"]
>;

/**
 * Turn the two answers into a slot.
 *
 * The two defaults are the same ones the old prompt stated in words, and they
 * stay in code because they are policy rather than judgment: a day with no meal
 * means dinner, and a meal with no day means today. Naming neither means no
 * plan, and the recipe saves without one.
 */
export function readSlot(answers: Answers, days: DayOption[], today: string): SlotResult {
  const day = answers.day?.choice;
  const meal = answers.meal?.choice;
  if (!day || !meal) return undefined;

  const namedDay = day !== NO_DAY && days.some((d) => d.key === day) ? day : null;
  const namedMeal = MEAL_SLOTS.includes(meal as Meal) ? (meal as Meal) : null;

  if (!namedDay && !namedMeal) return null;

  return {
    date: namedDay ?? today,
    meal: namedMeal ?? "dinner",
  };
}

let client: TypeSafeClient | null = null;

/** Built on first use, not at import: the constructor throws without a key,
 *  and a missing key must fall back to the model's own date rather than take
 *  dictation down. */
function getClient(): TypeSafeClient {
  client ??= new TypeSafeClient({ timeout: 8000, retry: { maxRetries: 1 } });
  return client;
}

/**
 * Work out the slot from what was actually said.
 *
 * Returns undefined when the service is unreachable, and the caller falls back
 * to the model's planDate plus the forward-walk repair — which is what shipped
 * before this existed.
 */
export async function resolveSlot(spoken: string, today: string): Promise<SlotResult> {
  const days = upcomingDays(today);
  if (days.length === 0) return undefined;

  try {
    const { answers } = await getClient().systemOne({
      state: { dictation: spoken, today: days[0].said },
      questions: buildSlotQuestions(days),
    });
    return readSlot(answers, days, today);
  } catch (err) {
    console.error("Plan slot unavailable; using the model's own date.", err);
    return undefined;
  }
}
