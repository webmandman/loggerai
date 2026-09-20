import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth-guard";
import { isActivityFresh, ONLINE_WINDOW_MS } from "@/lib/presence";
import type { PresenceUser } from "@/types";

/** Nobody needs a 500-character "activity"; it has to fit under a face. */
const ACTIVITY_MAX = 80;
const PATH_MAX = 200;

/**
 * Say you are here, and find out who else is.
 *
 * One call does both on purpose: a heartbeat that did not also return the
 * roster would double the requests for no benefit, since anyone who wants to
 * know who is on is by definition here themselves.
 */
export async function POST(request: NextRequest) {
  const { session, error } = await requireAuth();
  if (error) return error;

  const body = (await request.json().catch(() => null)) as {
    path?: unknown;
    activity?: unknown;
    idle?: unknown;
  } | null;

  const path =
    typeof body?.path === "string" ? body.path.slice(0, PATH_MAX) : "/";
  const activity =
    typeof body?.activity === "string" && body.activity.trim()
      ? body.activity.trim().slice(0, ACTIVITY_MAX)
      : null;

  const userId = session.user.id;

  // Only stamp activityAt when there is an activity, so a plain heartbeat
  // does not keep an old note alive. Clearing the activity clears the stamp
  // with it, which is what lets the note age out on its own.
  const activityAt = activity ? new Date() : null;
  const idle = body?.idle === true;

  await prisma.presence.upsert({
    where: { userId },
    create: { userId, path, activity, activityAt, idle },
    update: { path, activity, activityAt, idle },
  });

  const since = new Date(Date.now() - ONLINE_WINDOW_MS);

  const rows = await prisma.presence.findMany({
    where: { updatedAt: { gte: since }, userId: { not: userId } },
    include: { user: { select: { name: true, image: true } } },
    orderBy: { updatedAt: "desc" },
  });

  // Only other people come back. The client already knows about itself, and
  // showing your own face in a "who else is here" list reads as a bug.
  //
  // Staleness is decided here, against this server's clock, so the browser
  // never compares a server timestamp to the device's clock — a phone a few
  // minutes out would otherwise hide fresh notes or keep showing dead ones.
  const now = Date.now();

  const others: PresenceUser[] = rows.map((row) => ({
    userId: row.userId,
    name: row.user.name,
    image: row.user.image,
    path: row.path,
    activity: isActivityFresh(row.activityAt?.getTime(), now) ? row.activity : null,
    idle: row.idle,
    lastSeen: row.updatedAt.toISOString(),
  }));

  return NextResponse.json(
    { others },
    { headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}
