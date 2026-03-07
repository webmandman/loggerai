"use client";

import { useState, useEffect, useRef } from "react";
import { ChevronDown, ChevronUp, CalendarDays, Loader2 } from "lucide-react";

const CACHE_KEY = "logger_digest";

interface DigestData {
  summary: string | null;
  stats: {
    entryCount: number;
    categories: Record<string, number>;
    totalExerciseMinutes: number;
    actionItemsDone: number;
    actionItemsTotal: number;
  } | null;
}

interface CachedDigest {
  data: DigestData;
  entryCount: number;
}

function readCache(): CachedDigest | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeCache(data: DigestData, entryCount: number) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ data, entryCount }));
  } catch { /* quota exceeded etc */ }
}

export function WeeklyDigest() {
  const [data, setData] = useState<DigestData | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const fetched = useRef(false);

  useEffect(() => {
    if (fetched.current) return;
    fetched.current = true;

    (async () => {
      setLoading(true);
      try {
        const countRes = await fetch("/api/logs?limit=0&offset=0", { cache: "no-store" });
        const { total } = await countRes.json();

        const cached = readCache();
        if (cached && cached.entryCount === total) {
          setData(cached.data);
          setLoading(false);
          return;
        }

        const res = await fetch("/api/digest");
        const d = await res.json();
        setData(d);
        writeCache(d, total);
      } catch { /* silently fail */ }
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return (
      <div className="rounded-xl border border-border/60 p-4 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading weekly digest...
      </div>
    );
  }

  if (!data?.stats || data.stats.entryCount === 0) return null;

  const { stats, summary } = data;
  const pills: string[] = [];
  if (stats) {
    pills.push(`${stats.entryCount} entries`);
    if (stats.totalExerciseMinutes > 0) pills.push(`${stats.totalExerciseMinutes} min exercise`);
    if (stats.actionItemsTotal > 0) pills.push(`${stats.actionItemsDone}/${stats.actionItemsTotal} tasks done`);
  }

  return (
    <div className="rounded-xl border border-primary/15 bg-gradient-to-br from-primary/5 via-transparent to-primary/5 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-accent/30 transition-colors"
      >
        <div className="flex items-center gap-2 text-sm font-medium">
          <CalendarDays className="h-4 w-4 text-primary" />
          This Week
        </div>
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
      </button>
      {expanded && (
        <div className="px-4 pb-4 space-y-3 animate-in fade-in duration-200">
          {pills.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {pills.map((p) => (
                <span
                  key={p}
                  className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary"
                >
                  {p}
                </span>
              ))}
            </div>
          )}
          {summary && (
            <p className="text-sm leading-relaxed text-muted-foreground">
              {summary}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
