"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { HEARTBEAT_MS, onActivityChange, takeActivity } from "./presence";
import type { PresenceUser } from "@/types";

/**
 * Tell the server this person is here, and get back everyone else who is.
 *
 * Deliberately calls `fetch` rather than the shared `api()` wrapper. That
 * wrapper counts writes so background polling can hold off during a real
 * edit, and a heartbeat firing every ten seconds would look exactly like a
 * user editing — which would suppress the pantry refresh it is meant to sit
 * alongside. A heartbeat is not something anyone did.
 */
export function usePresence(): PresenceUser[] {
  const pathname = usePathname();
  const [others, setOthers] = useState<PresenceUser[]>([]);

  useEffect(() => {
    let cancelled = false;

    const beat = async () => {
      // A hidden tab is someone who walked away; letting them time out is the
      // point, so the list says who is actually looking.
      if (document.visibilityState !== "visible") return;

      try {
        const res = await fetch("/api/presence", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path: pathname, activity: takeActivity() }),
        });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setOthers(data.others ?? []);
      } catch {
        // Offline in a shop. Keep the last roster rather than blanking it.
      }
    };

    beat();
    const id = setInterval(beat, HEARTBEAT_MS);

    const onWake = () => {
      if (document.visibilityState === "visible") beat();
    };
    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("focus", onWake);

    // Someone adding an item should not wait up to ten seconds to be
    // announced — the whole point of a broadcast is that it lands while the
    // other person is still looking at the same screen.
    const unsubscribe = onActivityChange(() => {
      beat();
    });

    return () => {
      cancelled = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("focus", onWake);
      unsubscribe();
    };
  }, [pathname]);

  return others;
}
