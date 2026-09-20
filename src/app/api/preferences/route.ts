import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth-guard";
import { PREFERENCES_KEY, PREFERENCES_MAX } from "@/lib/preferences";

/** The cook's standing notes, folded into every suggestion prompt. */
export async function GET() {
  const { error } = await requireAuth();
  if (error) return error;

  const row = await prisma.setting.findUnique({ where: { key: PREFERENCES_KEY } });

  return NextResponse.json(
    { preferences: row?.value ?? "", updatedAt: row?.updatedAt ?? null },
    { headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}

/**
 * Replace them. This text goes straight into a prompt, so it is capped —
 * an unbounded paste would crowd out the pantry and the rules below it.
 */
export async function PUT(request: NextRequest) {
  const { error } = await requireAuth();
  if (error) return error;

  const body = (await request.json().catch(() => null)) as { preferences?: unknown } | null;

  if (typeof body?.preferences !== "string") {
    return NextResponse.json({ error: "Need some text" }, { status: 400 });
  }

  const value = body.preferences.trim().slice(0, PREFERENCES_MAX);

  const row = await prisma.setting.upsert({
    where: { key: PREFERENCES_KEY },
    create: { key: PREFERENCES_KEY, value },
    update: { value },
  });

  return NextResponse.json({ preferences: row.value, updatedAt: row.updatedAt });
}
