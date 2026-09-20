/**
 * The two fields of a log entry that are classifications rather than writing.
 *
 * `processLogEntry` asks one model call for nine things at once — a summary,
 * tags, action items, structured metadata, a date, two lists of groceries, and
 * these two. Eight of those are generation or extraction and belong there. A
 * category is a pick from eleven named options, and a mood is a pick from six.
 *
 * Splitting them out is not tidiness. That call ends in a `catch` that returns
 * an empty husk — category "note", no tags, no mood — and every entry logged
 * before 2026-09-13 is sitting in exactly that state, unfindable by category
 * because a JSON parse failed months ago. The husk is still the fallback for
 * the fields only the writing model can produce, but it no longer swallows the
 * two that can be answered independently. An entry whose extraction failed now
 * arrives categorised, which is what the feed filter runs on.
 *
 * Relative import of ../types on purpose: CATEGORIES is a value, and the "@/"
 * alias does not resolve under the bare `node --test` run.
 */
import { TypeSafeClient, choice, type SystemOneResult } from "@typesafe-ai/sdk";
import { CATEGORIES, type Category } from "../types/index.ts";

/**
 * The moods on offer: the five the old prompt named, and no more.
 *
 * There is deliberately no separate "none" option. The first version had one,
 * described as "nothing in the entry shows how they felt" — which is the same
 * thing "neutral" already means, and the eval showed it immediately: the model
 * answered neutral for every flat entry and never once picked none. Two
 * options for one concept split the probability between them and turn a
 * confident answer into an uncertain-looking one.
 *
 * So `neutral` carries that meaning, which is also what it meant in the entries
 * already stored — the old prompt offered it as an example and the digest has
 * been counting it since. A flat entry now gets "neutral" where it used to get
 * null; nothing reads mood as a boolean, and null stays valid for the rows that
 * already have it.
 */
export const MOODS = [
  "positive",
  "excited",
  "neutral",
  "anxious",
  "frustrated",
] as const;

export type Mood = (typeof MOODS)[number];

export interface Classification {
  category: Category;
  mood: Mood;
}

export const QUESTIONS = {
  category: choice(
    {
      question: "What kind of log entry is this?",
      context:
        "A personal logging app. The person is recording something about their own life, work or household.",
    },
    {
      task: "Something to be done, by them or by someone else.",
      idea: "A thought or proposal they want to come back to.",
      meeting: "A conversation with other people, and what came out of it.",
      personal: "Their own life outside work — family, health, feelings, plans.",
      note: {
        what: "An observation worth keeping that fits none of the others.",
        not_for: "Use a more specific kind whenever one fits. This is the leftover.",
      },
      reminder: "Something they must not forget at a particular time.",
      bug: "Something broken in software, and what it does wrong.",
      question: "Something they are unsure of and want to resolve later.",
      achievement: "Something they finished or did well.",
      grocery: "Food and the household's supply of it — bought, eaten, run out, planned.",
      other: "None of the above genuinely fits.",
    }
  ),

  mood: choice(
    {
      question: "How does the person come across in this entry?",
      focus: "Judge how they sound about what they are describing, not the subject itself.",
    },
    {
      positive: "Pleased, content, appreciative of how something went or how something is.",
      excited: "Energised, keen, looking forward to something.",
      neutral: {
        what: "Flat. They are putting something on the record and their feelings about it do not show, one way or the other.",
        note: "This is the answer for a plain note, task or shopping item. Do not read a feeling into an entry that does not state one.",
      },
      anxious: "Worried or apprehensive about something ahead of them.",
      frustrated: "Annoyed, or blocked by something that keeps happening.",
    }
  ),
} as const;

type Answers = Partial<SystemOneResult<typeof QUESTIONS>["answers"]>;

/**
 * Read the two answers.
 *
 * Neither is gated on confidence, and that is a decision rather than an
 * oversight. Both are pure labels on a saved entry: nothing is deleted, no
 * shopping list is cleared, and the person can change either from the feed. A
 * low-confidence "personal" is still a better guess than the "note" the old
 * catch handed out, and there is nothing safer to fall back TO — "note" and
 * "other" are options on the ballot, so the model can already pick them when
 * it means them.
 */
export function readClassification(answers: Answers): Classification | null {
  const category = answers.category?.choice;
  const mood = answers.mood?.choice;
  if (!category || !mood) return null;

  // Both criteria sets are held to CATEGORIES and MOODS by the tests, so the
  // chosen label is always one of them.
  return { category: category as Category, mood: mood as Mood };
}

let client: TypeSafeClient | null = null;

/** Built on first use, not at import: the constructor throws without a key,
 *  and a missing key must leave the older fields alone rather than take
 *  logging down. */
function getClient(): TypeSafeClient {
  client ??= new TypeSafeClient({ timeout: 8000, retry: { maxRetries: 1 } });
  return client;
}

/**
 * Classify one entry. Returns null when the service is unreachable, and the
 * caller falls back to whatever the writing model said — which is what shipped
 * before, including its "note" default.
 *
 * Runs alongside the big generation call rather than before it: the two do not
 * depend on each other, and this one finishes in a fraction of the time, so it
 * costs nothing on the clock.
 */
export async function classifyEntry(rawInput: string): Promise<Classification | null> {
  try {
    const { answers } = await getClient().systemOne({
      state: { entry: rawInput },
      questions: QUESTIONS,
    });
    return readClassification(answers);
  } catch (err) {
    console.error("Entry classification unavailable; using the writing model's fields.", err);
    return null;
  }
}

/** Guards the criteria against CATEGORIES drifting apart from them. */
export const CATEGORY_OPTIONS = CATEGORIES;
