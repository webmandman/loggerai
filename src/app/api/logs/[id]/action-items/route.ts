import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { normalizeActionItems } from "@/lib/utils";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const { index, done } = body;

  if (typeof index !== "number" || typeof done !== "boolean") {
    return NextResponse.json(
      { error: "index (number) and done (boolean) are required" },
      { status: 400 }
    );
  }

  const entry = await prisma.logEntry.findUnique({ where: { id } });
  if (!entry) {
    return NextResponse.json({ error: "Entry not found" }, { status: 404 });
  }

  const actionItems = normalizeActionItems(JSON.parse(entry.actionItems));

  if (index < 0 || index >= actionItems.length) {
    return NextResponse.json(
      { error: "Index out of bounds" },
      { status: 400 }
    );
  }

  actionItems[index] = { ...actionItems[index], done };

  await prisma.logEntry.update({
    where: { id },
    data: { actionItems: JSON.stringify(actionItems) },
  });

  return NextResponse.json({ actionItems });
}
