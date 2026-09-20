/**
 * Which pantry row a loosely-spoken food name belongs to, decided by asking
 * rather than by comparing word sets.
 *
 * `matchKey` still runs first and still owns the two passes that are certain:
 * an exact name, and a stored alias. Those are free, they are right, and in
 * steady state they answer almost everything — which is why this file usually
 * costs nothing. It only opens its mouth for what is left over.
 *
 * What is left over is where the set arithmetic was guessing:
 *
 *  - synonyms that share no words. "Romaine" and "lettuce", "cilantro" and
 *    "coriander", "scallion" and "green onion". The word-subset pass cannot
 *    reach these at all, and the alias pass only reaches them once someone has
 *    already been told about the pair.
 *  - genuine ambiguity. "Milk" against a pantry holding both "whole milk" and
 *    "oat milk" is not a match to compute, it is a question with no good
 *    answer. A Choice can say so, and in practice does: asked that exact
 *    question it puts ~0.7 on "none of these" rather than picking a milk.
 *  - near misses that look like matches to a word comparison and are not.
 *    "Chicken thigh" against "chicken breast" and "kidney bean" against
 *    "black bean" both refuse to merge, at 0.90 and 0.98 on "none of these".
 *
 * A wrong merge is the expensive mistake here, not a missed one: merging two
 * rows takes an item off the shopping list that nobody bought. A duplicate is
 * visible on the Pantry tab and one swipe from being merged by hand. So the
 * gate below is deliberately one-sided.
 *
 * Relative imports and a type-only `@/types`-style import keep this loadable
 * under the bare `node --test` run, same as normalize.ts and diet-check.ts.
 */
import {
  TypeSafeClient,
  choice,
  type ChoiceQuestion,
  type ChoiceResponse,
} from "@typesafe-ai/sdk";
import { matchKey, type ExistingItem, type KeyMatch } from "./normalize.ts";

/**
 * The "this is not in the pantry yet" option.
 *
 * Uppercase on purpose: `normalizeItemName` reduces every real key to
 * lowercase letters and spaces, so no pantry row can ever be named this and
 * collide with it.
 */
export const NONE_OF_THESE = "NONE_OF_THESE";

/**
 * Merge onto an existing row only when this much of the probability mass sits
 * on the row that was picked.
 *
 * Read `probabilities[choice]`, NOT `confidence`. Confidence measures how
 * concentrated the distribution is across all thirteen-odd options, and over a
 * ballot this long a right answer hedging against one rival is indistinguish-
 * able from a wrong one hedging against another. Measured over 24 judgments,
 * two runs of twelve names (jev-1.13.0, 2026-09-20), confidence overlapped
 * outright: "yoghurt" -> greek yogurt and "milk" -> a row of its own both came
 * back at 0.65, and they want opposite answers.
 *
 * The mass on the picked row does separate them, because the real contest is
 * between one named row and NONE_OF_THESE rather than between the foods. True
 * matches held 0.70 to 0.95; every name that deserved its own row put 0.68 to
 * 1.00 on NONE_OF_THESE instead, so it never reaches this bar at all.
 *
 * One number covers both ways a merge can be wrong. A food the pantry has not
 * got pushes mass onto NONE_OF_THESE. A food caught between two rows — "milk"
 * against "whole milk" and "oat milk" — splits it, and neither reaches half.
 *
 * ponytail: the 0.70 floor is the true-match evidence; the bar is the plain
 * "more likely than not" midpoint below it. No false merge occurred in those
 * 24, so the headroom is untested from the other side. Raise it rather than
 * lower it — the failure it guards is silent.
 */
export const MERGE_ABOVE = 0.5;

/**
 * Ceilings on what gets asked. Neither is a tuned number: the first is the
 * Choice option limit with room to spare, the second keeps one dictated
 * inventory from turning into a hundred-question request. Past either, the
 * word passes answer alone, exactly as they did before this file existed.
 */
const MAX_OPTIONS = 200;
const MAX_QUESTIONS = 25;

/** Answer key for one spoken name. Built in one place so the question and the
 *  verdict that reads it back cannot drift apart. */
function answerKey(index: number): string {
  return `item${index}`;
}

/**
 * One Choice per unresolved name, over the whole pantry plus a way out.
 *
 * The other names from the same batch ride along in state. A receipt that
 * lists "half and half" and "creamer" on separate lines is telling the model
 * something about both of them, and it costs a handful of tokens to say so.
 */
export function buildMatchQuestions(
  unresolved: string[],
  existing: ExistingItem[]
): Record<string, ChoiceQuestion> {
  const criteria: Record<string, unknown> = {};

  for (const item of existing) {
    criteria[item.name] = item.aliases.length ? { alsoCalled: item.aliases } : null;
  }

  criteria[NONE_OF_THESE] =
    "None of the items above is this food. It is something the pantry does not have a row for yet.";

  const questions: Record<string, ChoiceQuestion> = {};

  unresolved.forEach((name, i) => {
    questions[answerKey(i)] = choice(
      {
        heard: name,
        question: `Which item already in the pantry is "${name}" the same food as?`,
        sameFood:
          "A shorter everyday name for the same thing (\"yogurt\" for \"greek yogurt\"), or a different everyday name for it (\"creamer\" for \"half and half\", \"cilantro\" for \"coriander\", \"scallion\" for \"green onion\").",
        notSameFood:
          "A different variety somebody would buy separately and keep as its own line on a shopping list (\"oat milk\" against \"whole milk\", \"sweet potato\" against \"potato\"), or a different food entirely.",
      },
      criteria as Parameters<typeof choice>[1]
    );
  });

  return questions;
}

/**
 * Read the answers back as a map from spoken name to pantry row.
 *
 * Only confident, non-empty picks are in it. Everything else is absent, and
 * the caller treats absence as "write a new row" — the recoverable direction.
 */
export function chooseMatches(
  unresolved: string[],
  answers: Record<string, ChoiceResponse | undefined>
): Map<string, string> {
  const matched = new Map<string, string>();

  unresolved.forEach((name, i) => {
    const answer = answers[answerKey(i)];
    if (!answer || answer.choice === NONE_OF_THESE) return;
    if ((answer.probabilities[answer.choice] ?? 0) < MERGE_ABOVE) return;
    matched.set(name, answer.choice);
  });

  return matched;
}

let client: TypeSafeClient | null = null;

/** Built on first use, not at import: the constructor throws without a key,
 *  and a missing key must degrade to the word passes rather than take the
 *  pantry write path down. */
function getClient(): TypeSafeClient {
  client ??= new TypeSafeClient({ timeout: 8000, retry: { maxRetries: 1 } });
  return client;
}

/**
 * Resolve every incoming key against the pantry, exact and alias in code and
 * the rest by judgment.
 *
 * Never throws. On failure every name falls back to whatever `matchKey` made
 * of it, which is the behaviour that shipped before this file existed.
 *
 * Where the judgment does run, it REPLACES the word-subset guess rather than
 * deferring to it. A "subset" hit that the model would not confirm is exactly
 * the case subset matching gets wrong — two greek yogurts, one of them the
 * wrong one — and there is nothing to be gained by keeping the weaker answer
 * around as a tie-break.
 */
export async function resolveKeys(
  names: string[],
  existing: ExistingItem[]
): Promise<Map<string, KeyMatch>> {
  const resolved = new Map<string, KeyMatch>();
  for (const name of names) resolved.set(name, matchKey(name, existing));

  const unresolved = [...resolved]
    .filter(([, match]) => match.via === "subset" || match.via === "none")
    .map(([name]) => name);

  if (
    unresolved.length === 0 ||
    existing.length === 0 ||
    existing.length > MAX_OPTIONS ||
    unresolved.length > MAX_QUESTIONS
  ) {
    return resolved;
  }

  try {
    const { answers } = await getClient().systemOne({
      state: { heardInThisBatch: names },
      questions: buildMatchQuestions(unresolved, existing),
    });

    const matched = chooseMatches(unresolved, answers);

    for (const name of unresolved) {
      const onto = matched.get(name);
      resolved.set(
        name,
        onto ? { name: onto, via: "judged" } : { name, via: "none" }
      );
    }
  } catch (err) {
    console.error("Pantry matching unavailable; falling back to word passes.", err);
  }

  return resolved;
}
