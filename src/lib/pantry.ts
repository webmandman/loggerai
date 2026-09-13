import { prisma } from "@/lib/db";
import {
  matchKey,
  mergeAliases,
  normalizeItemName,
  toPantryRows,
  type ExistingItem,
} from "@/lib/normalize";

export { normalizeItemName };

export type PantryStatus = "available" | "needed";
export type PantrySource = "receipt" | "message" | "manual";

export interface PantryInput {
  name: string;
  label: string;
  quantity?: string | null;
  /** Other everyday names for this item, supplied by the model. */
  aliases?: string[];
}

function parseAliases(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((a) => typeof a === "string") : [];
  } catch {
    return [];
  }
}

async function loadExisting(): Promise<
  Array<ExistingItem & { label: string }>
> {
  const rows = await prisma.pantryItem.findMany({
    select: { name: true, label: true, aliases: true },
  });
  return rows.map((r) => ({
    name: r.name,
    label: r.label,
    aliases: parseAliases(r.aliases),
  }));
}

/**
 * Write a batch of items, resolving each against what is already in the pantry.
 *
 * `relabel` is the one behavioural difference between the two callers. A
 * receipt line is clean and specific, so it may improve an existing row's
 * display name ("creamer" -> "Half & Half"). A spoken mention is vaguer than
 * whatever it matched, so it must not overwrite "Greek Yogurt, Plain" with
 * "yogurt".
 */
async function write(
  items: PantryInput[],
  status: PantryStatus,
  source: PantrySource,
  relabel: boolean
) {
  const rows = toPantryRows(items, status, source);
  if (rows.length === 0) return [];

  const existing = await loadExisting();
  const byName = new Map(existing.map((e) => [e.name, e]));

  const writes = rows.map((row) => {
    const incomingAliases = items.find(
      (i) => normalizeItemName(i.name || i.label || "") === row.name
    )?.aliases;

    const match = matchKey(row.name, existing);
    const target = byName.get(match.name);

    // A non-exact match taught us a new name for this item. Store it so the
    // next mention is an exact hit and stays correct as the pantry changes.
    const learned = match.via === "alias" || match.via === "subset" ? [row.name] : [];

    const name = match.name;
    const label = target && !relabel ? target.label : row.label;
    const aliases = mergeAliases(name, target?.aliases, incomingAliases, learned);

    return {
      name,
      label,
      aliases: JSON.stringify(aliases),
      quantity: status === "needed" ? null : row.quantity,
      status,
      source,
    };
  });

  return prisma.$transaction(
    writes.map((row) =>
      prisma.pantryItem.upsert({
        where: { name: row.name },
        create: row,
        update: {
          label: row.label,
          aliases: row.aliases,
          quantity: row.quantity,
          status: row.status,
          source: row.source,
        },
      })
    )
  );
}

/**
 * Stock arrived. This is ALSO the shopping-list removal: flipping status to
 * "available" is what takes an item off the needed list. There is no separate
 * "clear from shopping list" step to forget to call.
 */
export function markAvailable(items: PantryInput[], source: PantrySource = "receipt") {
  return write(items, "available", source, true);
}

/**
 * Something ran out. Upsert rather than update so "we're out of saffron" works
 * for food that was never scanned in.
 */
export function markNeeded(items: PantryInput[], source: PantrySource = "message") {
  return write(items, "needed", source, false);
}

/** Names a receipt item would land on, for reporting what a scan cleared. */
export async function resolveNames(items: PantryInput[]): Promise<string[]> {
  const existing = await loadExisting();
  return items
    .map((i) => normalizeItemName(i.name || i.label || ""))
    .filter(Boolean)
    .map((name) => matchKey(name, existing).name);
}
