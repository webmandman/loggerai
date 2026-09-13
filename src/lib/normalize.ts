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

/**
 * Map a loosely-spoken key onto an item already in the pantry.
 *
 * A receipt says "greek yogurt"; you say "we finished the yogurt". Without this
 * those are two rows and the shopping list never clears. Matches only when one
 * key's words are a strict subset of the other's, and only when exactly one
 * candidate qualifies — an ambiguous match gets its own row rather than a wrong
 * guess.
 *
 * ponytail: word-subset matching, no fuzzy distance. If real misses show up
 * ("creamer" vs "coffee creamer half and half"), the upgrade is an alias column,
 * not a similarity library.
 */
export function resolveKey(incoming: string, existingNames: string[]): string {
  if (!incoming || existingNames.includes(incoming)) return incoming;

  const words = new Set(incoming.split(" "));

  const candidates = existingNames.filter((existing) => {
    const other = new Set(existing.split(" "));
    if (other.size === words.size) return false; // same length, genuinely different
    const [small, big] = words.size < other.size ? [words, other] : [other, words];
    return [...small].every((w) => big.has(w));
  });

  return candidates.length === 1 ? candidates[0] : incoming;
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
