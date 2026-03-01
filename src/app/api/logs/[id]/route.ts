import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const entry = await prisma.logEntry.findUnique({ where: { id } });
  if (!entry) {
    return NextResponse.json({ error: "Entry not found" }, { status: 404 });
  }

  await prisma.logEntry.delete({ where: { id } });

  return NextResponse.json({ success: true });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const { summary } = body;

  if (typeof summary !== "string" || !summary.trim()) {
    return NextResponse.json(
      { error: "summary (string) is required" },
      { status: 400 }
    );
  }

  const entry = await prisma.logEntry.findUnique({ where: { id } });
  if (!entry) {
    return NextResponse.json({ error: "Entry not found" }, { status: 404 });
  }

  const updated = await prisma.logEntry.update({
    where: { id },
    data: { summary: summary.trim() },
  });

  return NextResponse.json({ summary: updated.summary });
}
