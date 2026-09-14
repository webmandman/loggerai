import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth-guard";
import { serializeRecipe } from "@/lib/recipes";

/** Star or unstar. */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth();
  if (error) return error;

  const { id } = await params;
  const { favorite } = await request.json();

  if (typeof favorite !== "boolean") {
    return NextResponse.json({ error: "favorite must be a boolean" }, { status: 400 });
  }

  const existing = await prisma.savedRecipe.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Recipe not found" }, { status: 404 });
  }

  const row = await prisma.savedRecipe.update({ where: { id }, data: { favorite } });
  return NextResponse.json(serializeRecipe(row));
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth();
  if (error) return error;

  const { id } = await params;

  const existing = await prisma.savedRecipe.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Recipe not found" }, { status: 404 });
  }

  await prisma.savedRecipe.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
