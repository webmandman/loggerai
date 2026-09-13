/**
 * Dedupe key for a food item. The model is asked to return singular lowercase
 * names already; this is the defensive layer that catches receipt cruft like
 * "BANANAS ORGANIC 4011" and casing/plural drift between a receipt and a
 * spoken message about the same food.
 *
 * Kept dependency-free (no prisma, no path aliases) so `src/lib/pantry.test.ts`
 * can import it under a bare `node --test` run.
 *
 * ponytail: naive trailing-plural rule. Upgrade path if it starts colliding
 * ("molasses" -> "molasse") is a small irregular-word map, not a stemmer dep.
 */
export function normalizeItemName(raw: string): string {
  const cleaned = raw
    // Split camelCase BEFORE lowercasing. The model sometimes answers
    // "oliveOil" instead of "olive oil", and lowercasing first would weld it
    // into "oliveoil" — a key that never matches the receipt's "olive oil".
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ") // drop digits, punctuation, PLU codes
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) return "";

  // Every word, not just the last: receipts lead with the noun
  // ("BANANAS ORGANIC") while speech trails it ("green beans").
  return cleaned.split(" ").map(singularize).join(" ");
}

export interface PantryRowInput {
  name: string;
  label: string;
  quantity?: string | null;
}

/**
 * Turn a model's item list into the exact rows to upsert. Pure and
 * dependency-free so it can be tested without a database: this is where item
 * dedupe and the available/needed status decision actually happen.
 */
export function toPantryRows(
  items: PantryRowInput[],
  status: "available" | "needed",
  source: string
) {
  const seen = new Map<string, { name: string; label: string; quantity: string | null }>();

  for (const item of items) {
    const name = normalizeItemName(item.name || item.label || "");
    if (!name) continue;
    // Last mention wins — a receipt listing bananas on two lines is one row.
    seen.set(name, {
      name,
      label: (item.label || item.name).trim(),
      quantity: item.quantity?.trim() || null,
    });
  }

  return [...seen.values()].map((row) => ({ ...row, status, source }));
}

export interface ExistingItem {
  name: string;
  aliases: string[];
}

export interface KeyMatch {
  /** The row to write to — an existing item's name, or `incoming` for a new row. */
  name: string;
  /** How it matched. "none" means no existing row fits; write a new one. */
  via: "exact" | "alias" | "subset" | "none";
}

/**
 * Map a loosely-spoken key onto an item already in the pantry.
 *
 * A receipt says "greek yogurt"; you say "we finished the yogurt". Without this
 * they are two rows and the shopping list never clears.
 *
 * Three passes, most-certain first:
 *  1. exact name
 *  2. a stored alias — the only pass that reaches synonyms sharing no words
 *     ("half and half" / "creamer", "scallion" / "green onion")
 *  3. strict word-subset ("yogurt" inside "greek yogurt")
 *
 * Passes 2 and 3 require exactly one candidate. Ambiguity ("milk" against both
 * "whole milk" and "oat milk") returns "none" and gets its own row — a wrong
 * merge is worse than a duplicate, because it silently clears the wrong item.
 */
export function matchKey(incoming: string, existing: ExistingItem[]): KeyMatch {
  if (!incoming) return { name: incoming, via: "none" };

  if (existing.some((e) => e.name === incoming)) {
    return { name: incoming, via: "exact" };
  }

  const byAlias = existing.filter((e) => e.aliases.includes(incoming));
  if (byAlias.length === 1) return { name: byAlias[0].name, via: "alias" };
  if (byAlias.length > 1) return { name: incoming, via: "none" };

  const words = new Set(incoming.split(" "));
  const bySubset = existing.filter((e) => {
    const other = new Set(e.name.split(" "));
    if (other.size === words.size) return false; // same length, genuinely different
    const [small, big] = words.size < other.size ? [words, other] : [other, words];
    return [...small].every((w) => big.has(w));
  });

  return bySubset.length === 1
    ? { name: bySubset[0].name, via: "subset" }
    : { name: incoming, via: "none" };
}

/** Merge alias lists, normalized and deduped, never including the row's own name. */
export function mergeAliases(
  own: string,
  ...lists: Array<string[] | undefined>
): string[] {
  const out = new Set<string>();
  for (const list of lists ?? []) {
    for (const raw of list ?? []) {
      const key = normalizeItemName(raw);
      if (key && key !== own) out.add(key);
    }
  }
  return [...out].sort();
}

export interface MergeSide {
  name: string;
  label: string;
  aliases: string[];
  quantity: string | null;
}

/**
 * Work out what the surviving row looks like when two duplicates are merged.
 *
 * The target wins on the things a person can see — label and status — because
 * the person picked it; predictable beats clever when you are merging by hand.
 * The source contributes its name and aliases, which is the whole point: the
 * phrasing that produced the duplicate becomes an alias, so the same wording
 * resolves correctly next time instead of splitting again.
 */
export function planMerge(from: MergeSide, into: MergeSide) {
  return {
    aliases: mergeAliases(into.name, into.aliases, from.aliases, [from.name]),
    // Keep whatever quantity we actually know; the target's reading wins.
    quantity: into.quantity ?? from.quantity ?? null,
    label: into.label,
  };
}

function singularize(word: string): string {
  if (word.length <= 3) return word; // "gas", "oil", "egg"
  if (/[^aeiou]ies$/.test(word)) return `${word.slice(0, -3)}y`; // berries -> berry
  if (/oes$/.test(word)) return word.slice(0, -2); // tomatoes -> tomato
  if (/(ch|sh|ss|x|z)es$/.test(word)) return word.slice(0, -2); // peaches -> peach
  if (/(ss|us|is)$/.test(word)) return word; // hummus, couscous, molasses
  if (/s$/.test(word)) return word.slice(0, -1); // bananas -> banana
  return word;
}
