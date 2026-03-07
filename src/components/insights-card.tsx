"use client";

import { useState, useEffect, useRef } from "react";
import { Lightbulb, X } from "lucide-react";
import { api } from "@/lib/api";

const CACHE_KEY = "logger_insights";

interface CachedInsights {
  insights: string[];
  entryCount: number;
}

function readCache(): CachedInsights | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeCache(data: CachedInsights) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(data));
  } catch { /* quota exceeded etc */ }
}

export function InsightsCard() {
  const [insights, setInsights] = useState<string[] | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const fetched = useRef(false);

  useEffect(() => {
    if (fetched.current) return;
    fetched.current = true;

    (async () => {
      try {
        const countRes = await api("/api/logs?limit=0&offset=0");
        const { total } = await countRes.json();

        const cached = readCache();
        if (cached && cached.entryCount === total) {
          setInsights(cached.insights);
          return;
        }

        const res = await api("/api/insights");
        const data = await res.json();
        if (data.insights && data.insights.length > 0) {
          setInsights(data.insights);
          writeCache({ insights: data.insights, entryCount: total });
        }
      } catch { /* silently fail */ }
    })();
  }, []);

  if (!insights || insights.length === 0 || dismissed) return null;

  return (
    <div className="rounded-xl border border-amber-500/15 bg-gradient-to-br from-amber-500/5 via-transparent to-amber-500/5 p-4 animate-in fade-in duration-300">
      <div className="flex items-start gap-3">
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-500/10">
          <Lightbulb className="h-3.5 w-3.5 text-amber-500" />
        </div>
        <div className="flex-1 space-y-1.5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-amber-500/70 uppercase tracking-wider">
              Insights
            </p>
            <button
              onClick={() => setDismissed(true)}
              className="text-muted-foreground/40 hover:text-muted-foreground transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          {insights.map((insight, i) => (
            <p key={i} className="text-sm leading-relaxed text-foreground/90">
              {insight}
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}
