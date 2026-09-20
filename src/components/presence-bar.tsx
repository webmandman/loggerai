"use client";

import { useSession } from "next-auth/react";
import { usePresence } from "@/lib/use-presence";
import { describePresence, firstName } from "@/lib/presence";
import { cn } from "@/lib/utils";

/**
 * Who else is in the app, with a line under each face saying what they are up
 * to.
 *
 * The notes float over the page rather than pushing it down: presence is
 * ambient information, and a header that changes height every time someone
 * picks up their phone would shove the list you are reading around.
 */
export function PresenceBar() {
  const { data: session } = useSession();
  const others = usePresence();

  // No session means the header is not really up yet; no others means nobody
  // to report, and an empty rail would just be a gap.
  if (!session?.user || others.length === 0) return null;

  return (
    <div className="relative">
      {/* Spaced rather than overlapped: the status ring is the point, and
          overlapping faces would clip the ring off the one behind. */}
      <div className="flex items-center gap-1.5">
        {others.map((person) => (
          <Face
            key={person.userId}
            name={person.name}
            image={person.image}
            idle={person.idle}
          />
        ))}
      </div>

      <div
        // Pinned under the faces and right-aligned to them. Pointer events off
        // so a note never eats a tap meant for whatever is underneath it.
        className="absolute right-0 top-full mt-1.5 z-40 pointer-events-none flex flex-col items-end gap-1"
      >
        {others.map((person) => {
          // A stale activity already arrived as null, so this quietly falls
          // back to the route on the next heartbeat with no timer here.
          const note = describePresence(person.path, person.activity);
          const line = `${firstName(person.name)} ${note}`;

          return (
            <p
              key={person.userId}
              title={line}
              className={cn(
                "max-w-[60vw] truncate rounded-full border border-border/60",
                "bg-popover/95 backdrop-blur-sm px-2.5 py-1",
                "text-[11px] leading-none text-muted-foreground shadow-sm",
                "animate-in fade-in slide-in-from-top-1 duration-200"
              )}
            >
              <span className="font-medium text-foreground">
                {firstName(person.name)}
              </span>{" "}
              {note}
            </p>
          );
        })}
      </div>
    </div>
  );
}

function Face({
  name,
  image,
  idle,
}: {
  name: string | null;
  image: string | null;
  idle: boolean;
}) {
  const label = firstName(name);
  // Only two states reach here. Someone whose tab is hidden stops sending
  // heartbeats and falls off the roster entirely, so "gone" needs no colour —
  // it is the absence of a face.
  const status = idle ? "idle" : "active";

  return (
    <div
      title={`${label} — ${status}`}
      aria-label={`${label} is ${status}`}
      className={cn(
        "h-7 w-7 rounded-full overflow-hidden bg-muted",
        "ring-2 ring-offset-2 ring-offset-background transition-colors duration-300",
        idle ? "ring-amber-400/80" : "ring-emerald-500"
      )}
    >
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={image}
          alt=""
          className={cn(
            "h-full w-full object-cover transition-opacity",
            // Dimmed as well as ringed, so the state is not carried by colour
            // alone — the ring is unreadable to anyone colourblind on its own.
            idle && "opacity-60"
          )}
          referrerPolicy="no-referrer"
        />
      ) : (
        <div className="h-full w-full flex items-center justify-center text-[10px] font-medium">
          {label.charAt(0)}
        </div>
      )}
    </div>
  );
}
