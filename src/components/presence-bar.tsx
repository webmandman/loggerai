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
      <div className="flex items-center -space-x-2">
        {others.map((person) => (
          <Face key={person.userId} name={person.name} image={person.image} />
        ))}
      </div>

      <div
        // Pinned under the faces and right-aligned to them. Pointer events off
        // so a note never eats a tap meant for whatever is underneath it.
        className="absolute right-0 top-full mt-1.5 z-40 pointer-events-none flex flex-col items-end gap-1"
      >
        {others.map((person) => (
          <p
            key={person.userId}
            className={cn(
              "whitespace-nowrap rounded-full border border-border/60",
              "bg-popover/95 backdrop-blur-sm px-2.5 py-1",
              "text-[11px] leading-none text-muted-foreground shadow-sm",
              "animate-in fade-in slide-in-from-top-1 duration-200"
            )}
          >
            <span className="font-medium text-foreground">
              {firstName(person.name)}
            </span>{" "}
            {describePresence(person.path, person.activity)}
          </p>
        ))}
      </div>
    </div>
  );
}

function Face({ name, image }: { name: string | null; image: string | null }) {
  const label = firstName(name);

  return (
    <div
      title={label}
      className="h-7 w-7 rounded-full overflow-hidden ring-2 ring-background bg-muted"
    >
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={image}
          alt={label}
          className="h-full w-full object-cover"
          referrerPolicy="no-referrer"
        />
      ) : (
        <div className="h-full w-full flex items-center justify-center text-[10px] font-medium">
          {label.charAt(0)}
        </div>
      )}
      {/* A green dot would be redundant: being in this list is what "online"
          means here, since anyone stale has already been filtered out. */}
    </div>
  );
}
