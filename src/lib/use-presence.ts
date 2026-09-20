"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { HEARTBEAT_MS, isIdle, onActivityChange, takeActivity } from "./presence";
import type { PresenceUser } from "@/types";

/** Anything that means a person is still there, rather than the page moving. */
const INTERACTIONS = ["pointerdown", "keydown", "scroll", "touchstart"] as const;

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
  // Starts empty rather than at Date.now(): reading the clock during render
  // is impure, and an unset value already reads as "just arrived".
  const lastInteraction = useRef<number | null>(null);

  useEffect(() => {
    const touch = () => {
      lastInteraction.current = Date.now();
    };
    touch();

    // Passive: none of these are cancelled, and a non-passive scroll listener
    // on window is a needless brake on every scroll in the app.
    INTERACTIONS.forEach((name) =>
      window.addEventListener(name, touch, { passive: true })
    );
    return () =>
      INTERACTIONS.forEach((name) => window.removeEventListener(name, touch));
  }, []);

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
          body: JSON.stringify({
            path: pathname,
            activity: takeActivity(),
            // Judged here, against this device's own clock, for the same
            // reason activity staleness is judged on the server: both
            // timestamps have to come from the same place.
            idle: isIdle(lastInteraction.current, Date.now()),
          }),
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
