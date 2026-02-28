"use client";

import { LogCard } from "@/components/log-card";
import { Skeleton } from "@/components/ui/skeleton";
import type { LogEntry } from "@/types";

interface LogFeedProps {
  entries: LogEntry[];
  isLoading: boolean;
  highlightedIds?: string[];
}

export function LogFeed({
  entries,
  isLoading,
  highlightedIds = [],
}: LogFeedProps) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-xl border p-4 space-y-3">
            <div className="flex justify-between">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
            <div className="flex gap-1">
              <Skeleton className="h-5 w-14 rounded-full" />
              <Skeleton className="h-5 w-18 rounded-full" />
            </div>
            <div className="flex justify-between">
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-5 w-12" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground text-lg">No log entries yet</p>
        <p className="text-muted-foreground text-sm mt-1">
          Start by typing or speaking your first entry above
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {entries.map((entry) => (
        <LogCard
          key={entry.id}
          entry={entry}
          highlighted={highlightedIds.includes(entry.id)}
        />
      ))}
    </div>
  );
}
