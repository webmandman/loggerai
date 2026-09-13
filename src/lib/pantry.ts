import { prisma } from "@/lib/db";
import { normalizeItemName, resolveKey, toPantryRows } from "@/lib/normalize";

export { normalizeItemName };

export type PantryStatus = "available" | "needed";
export type PantrySource = "receipt" | "message" | "manual";

export interface PantryInput {
  name: string;
  label: string;
  quantity?: string | null;
}

async function upsertAll(rows: ReturnType<typeof toPantryRows>) {
  if (rows.length === 0) return [];

  return prisma.$transaction(
    rows.map((row) =>
      prisma.pantryItem.upsert({
        where: { name: row.name },
        create: row,
        update: {
          label: row.label,
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
  return upsertAll(toPantryRows(items, "available", source));
}

/**
 * Something ran out. Upsert rather than update so "we're out of saffron" works
 * for food that was never scanned in.
 *
 * Unlike the receipt path, spoken phrasing is loose — "the yogurt" for a row
 * scanned in as "greek yogurt" — so keys are resolved against what is already
 * in the pantry before writing. Receipts stay exact; they are consistent.
 */
export async function markNeeded(
  items: PantryInput[],
  source: PantrySource = "message"
) {
  const rows = toPantryRows(items, "needed", source);
  if (rows.length === 0) return [];

  const existingNames = (
    await prisma.pantryItem.findMany({ select: { name: true } })
  ).map((i) => i.name);

  return upsertAll(
    rows.map((row) => ({ ...row, name: resolveKey(row.name, existingNames) }))
  );
}
