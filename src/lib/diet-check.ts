/**
 * Decide whether a recipe breaks a diet restriction, by asking rather than by
 * matching words.
 *
 * This replaces `filterByDiet` at every call site; that function stays as the
 * fallback for when TypeSafe is unreachable, and nowhere else. Measured over
 * six hand-labelled recipes (12 judgments, jev-1.13.0, 2026-09-20) the word
 * list got two of the six wrong and this got all twelve right — so running the
 * word list first, as this file originally did, could only subtract:
 *
 *  - it kept ALL THREE unsafe dishes. "Béchamel" and "lasagne sheets" are in
 *    neither ban list, and butter added by a STEP is invisible to it — it
 *    reads `ingredient.item` and nothing else;
 *  - it dropped a safe Pad Thai, because "noodle" is in the gluten list and
 *    rice noodles are not gluten.
 *
 * Relative import of ./diet.ts on purpose, and the `@/types` import is
 * type-only so it erases: both keep this file loadable under the bare
 * `node --test` run, same as diet.ts and recipes.ts.
 */
import { TypeSafeClient, noul, type NoulQuestion, type NoulResponse } from "@typesafe-ai/sdk";
import { filterByDiet } from "./diet.ts";
import type { Recipe, RecipeOptions } from "@/types";

/** The restrictions that get a judgment, and how to ask about each. */
const RESTRICTIONS = {
  lactoseFree: {
    key: "dairy",
    question:
      "Does this dish contain dairy? Read its ingredients and its steps together, and judge only what they actually say.",
    yes: "An ingredient or a step brings in milk-derived dairy — milk, cream, butter, cheese, yoghurt or ghee. This counts when it arrives inside a named component made with one, such as béchamel, alfredo, paneer, ranch or a creamy dressing, and when a step adds it without the ingredient list mentioning it.",
    no: "Nothing written down brings in milk-derived dairy. A dish that is often cooked with dairy elsewhere, but whose own ingredients and steps never name any, belongs here — judge the recipe in front of you, not the usual version of it. An ingredient explicitly named lactose-free, dairy-free or plant-based — oat milk, vegan butter, coconut cream — also belongs here.",
  },
  glutenFree: {
    key: "gluten",
    question:
      "Does this dish contain wheat, barley or rye gluten? Read its ingredients and its steps together, and judge only what they actually say.",
    yes: "An ingredient or a step brings in wheat, barley or rye. This counts when it arrives inside a named component made with one, such as naan, panko, orzo, udon, seitan, couscous, a flour roux or regular soy sauce, and when a step adds it without the ingredient list mentioning it.",
    no: "Nothing written down brings in wheat, barley or rye. A dish that is often cooked with soy sauce, a flour thickener or a bread crumb elsewhere, but whose own ingredients and steps never name one, belongs here — judge the recipe in front of you, not the usual version of it. An ingredient explicitly named gluten-free, or a naturally gluten-free staple such as rice, quinoa, buckwheat or corn, also belongs here.",
  },
} as const;

export type Restriction = keyof typeof RESTRICTIONS;

const ALL: Restriction[] = ["lactoseFree", "glutenFree"];

/**
 * Drop the recipe above this probability of containing the thing.
 *
 * Sits in the middle of a measured gap rather than being guessed: over the six
 * labelled recipes above, nothing safe scored higher than 0.11 and nothing
 * unsafe lower than 0.87. Anywhere in 0.2–0.8 would separate them identically,
 * so the bar is the plain "more likely than not" reading and there is no fitted
 * number to go stale.
 *
 * An earlier 0.15 — picked to bias toward dropping, before any measurement —
 * was below that floor and threw away a safe dish. Worth remembering that the
 * safe side of a Noul is not pinned at zero.
 *
 * ponytail: one bar for both restrictions, six recipes of evidence. Re-measure
 * on real suggestions before trusting it further, and split it per restriction
 * only if they actually separate differently.
 */
export const DROP_ABOVE = 0.5;

/** Which restrictions the cook actually switched on. */
export function activeRestrictions(options: RecipeOptions): Restriction[] {
  return ALL.filter((k) => options[k]);
}

/** Answer key for one recipe/restriction pair. Built in one place so the
 *  question and the verdict that reads it back cannot drift apart. */
function answerKey(restriction: Restriction, index: number): string {
  return `${RESTRICTIONS[restriction].key}${index}`;
}

/**
 * One Noul per recipe per active restriction, all for a single request.
 *
 * They are independent, so they evaluate in parallel and cost about what one
 * of them would. Five recipes against both toggles is ten questions and one
 * round trip.
 */
export function buildQuestions(
  count: number,
  active: Restriction[]
): Record<string, NoulQuestion> {
  const questions: Record<string, NoulQuestion> = {};

  for (let i = 0; i < count; i++) {
    for (const restriction of active) {
      const r = RESTRICTIONS[restriction];
      questions[answerKey(restriction, i)] = noul(
        `${r.question} The dish is \`recipes[${i}]\`.`,
        { true: r.yes, false: r.no }
      );
    }
  }

  return questions;
}

/**
 * Apply the answers back onto the recipes.
 *
 * A missing answer drops the recipe. Unlike a failed request, which falls back
 * to the word list wholesale, a batch that came back short is an answer we
 * cannot account for on a dish we were asked to vet — and there is no second
 * opinion left to consult, because the word list demonstrably passes the
 * dishes that matter. One lost suggestion out of five is the cheap direction.
 */
export function keepByVerdicts<T extends Recipe>(
  recipes: T[],
  active: Restriction[],
  answers: Record<string, NoulResponse | undefined>
): T[] {
  return recipes.filter((_, i) =>
    active.every((restriction) => {
      const answer = answers[answerKey(restriction, i)];
      return answer !== undefined && answer.noul <= DROP_ABOVE;
    })
  );
}

let client: TypeSafeClient | null = null;

/** Built on first use, not at import: the constructor throws without a key,
 *  and a missing key must degrade to the word list rather than take the
 *  module down. */
function getClient(): TypeSafeClient {
  // Both call sites sit inside a 60s route budget behind a 16k-token
  // generation, so this gets a short leash rather than the 10s x 3 default.
  client ??= new TypeSafeClient({ timeout: 8000, retry: { maxRetries: 1 } });
  return client;
}

/**
 * Screen recipes against whichever restrictions the cook switched on.
 *
 * Never throws. When the request fails it degrades to `filterByDiet` — the
 * behaviour that shipped before this file existed — because losing the whole
 * Recipes tab to a screening outage is worse than the pass it replaces. The
 * reason is logged and not surfaced: these toggles are a preference, and the
 * header comment in diet.ts is still the honest statement of what they are
 * and are not good for.
 *
 * ponytail: the outage is invisible to the cook. Thread a flag out to the
 * route if anyone ever needs to know the screening was the weak kind.
 */
export async function screenDiet<T extends Recipe>(
  recipes: T[],
  options: RecipeOptions
): Promise<T[]> {
  const active = activeRestrictions(options);
  if (active.length === 0 || recipes.length === 0) return recipes;

  try {
    const { answers } = await getClient().systemOne({
      state: {
        recipes: recipes.map((r) => ({
          title: r.title,
          ingredients: r.ingredients.map((i) => i.item),
          // The steps are here for the butter that never made the ingredient
          // list. They are the half of the recipe diet.ts cannot read.
          steps: r.steps,
        })),
      },
      questions: buildQuestions(recipes.length, active),
    });

    return keepByVerdicts(recipes, active, answers);
  } catch (err) {
    console.error("Diet screening unavailable; falling back to the word list.", err);
    return filterByDiet(recipes, options);
  }
}
