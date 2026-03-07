"use client";

import { useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";
import { LogCard } from "@/components/log-card";
import { Skeleton } from "@/components/ui/skeleton";
import type { LogEntry } from "@logger-ai/shared";

interface LogFeedProps {
  entries: LogEntry[];
  isLoading: boolean;
  onActionItemToggle?: (entryId: string, index: number, done: boolean) => void;
  onDeleteEntry?: (entryId: string) => void;
  onEditSummary?: (entryId: string, summary: string) => void;
  onLoadMore?: () => void;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  newEntryIds?: string[];
}

export function LogFeed({
  entries,
  isLoading,
  onActionItemToggle,
  onDeleteEntry,
  onEditSummary,
  onLoadMore,
  hasMore = false,
  isLoadingMore = false,
  newEntryIds,
}: LogFeedProps) {
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!onLoadMore || !hasMore) return;
    const el = sentinelRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) onLoadMore(); },
      { rootMargin: "200px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [onLoadMore, hasMore]);

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
          Tap the mic button to record your first entry
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
          onActionItemToggle={onActionItemToggle}
          onDelete={onDeleteEntry}
          onEditSummary={onEditSummary}
          className={newEntryIds?.includes(entry.id) ? "animate-in fade-in slide-in-from-top-2 duration-500" : undefined}
        />
      ))}
      {hasMore && (
        <div ref={sentinelRef} className="flex justify-center py-4">
          {isLoadingMore && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
        </div>
      )}
    </div>
  );
}
