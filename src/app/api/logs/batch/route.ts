import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth-guard";
import { normalizeActionItems } from "@/lib/utils";

export async function POST(request: NextRequest) {
  const { error } = await requireAuth();
  if (error) return error;

  const { ids } = await request.json();

  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ entries: [] });
  }

  const entries = await prisma.logEntry.findMany({
    where: { id: { in: ids } },
    orderBy: { createdAt: "desc" },
  });

  const serialized = entries.map((entry) => ({
    ...entry,
    tags: JSON.parse(entry.tags),
    actionItems: normalizeActionItems(JSON.parse(entry.actionItems)),
    metadata: JSON.parse(entry.metadata || "{}"),
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
  }));

  return NextResponse.json({ entries: serialized });
}
