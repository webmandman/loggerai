"use client";

import { useEffect, useRef } from "react";
import { writesInFlight } from "./api";
import { POLL_INTERVAL_MS, shouldPoll } from "./live";

/**
 * Keep a page's shared state fresh while someone is looking at it.
 *
 * Polling rather than a push channel on purpose: one serverless instance
 * cannot notify connections held by another, so real push would need a broker
 * in front of it. For a handful of people editing the same list, a read every
 * ten seconds costs less than that broker and cannot fall over on its own.
 *
 * `refresh` is called with `true` to mark the load as a background one, so the
 * page can drop the result if it has gone stale and can stay quiet about
 * failures — a shop with no signal should not paint an error over the list.
 */
export function useLive(refresh: (background: boolean) => void, paused = false) {
  const latest = useRef(refresh);

  // Kept in an effect rather than assigned during render, so a re-render with
  // a new closure never leaves the interval below pointing at a stale one.
  useEffect(() => {
    latest.current = refresh;
  });

  useEffect(() => {
    const tick = () => {
      if (!shouldPoll(document.visibilityState, writesInFlight(), paused)) return;
      latest.current(true);
    };

    // Coming back to the tab is the moment freshness matters most: a phone out
    // of a pocket should not show the list as it was twenty minutes ago.
    const onWake = () => {
      if (document.visibilityState === "visible") tick();
    };

    const id = setInterval(tick, POLL_INTERVAL_MS);
    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("focus", onWake);

    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("focus", onWake);
    };
  }, [paused]);
}
