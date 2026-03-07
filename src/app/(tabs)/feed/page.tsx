"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { LogFeed } from "@/components/log-feed";
import { FilterBar } from "@/components/filter-bar";
import type { LogEntry } from "@/types";

const PAGE_SIZE = 20;

export default function FeedPage() {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<{ from: string | null; to: string | null }>({ from: null, to: null });
  const [newEntryIds, setNewEntryIds] = useState<string[]>([]);
  const newEntryTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const fetchEntries = useCallback(async (category?: string | null, from?: string | null, to?: string | null, offset = 0) => {
    if (offset === 0) setIsLoading(true);
    else setIsLoadingMore(true);

    try {
      const params = new URLSearchParams();
      if (category) params.set("category", category);
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      params.set("limit", String(PAGE_SIZE));
      params.set("offset", String(offset));

      const res = await fetch(`/api/logs?${params.toString()}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();

      if (offset === 0) {
        setEntries(data.entries || []);
      } else {
        setEntries((prev) => [...prev, ...(data.entries || [])]);
      }
      setTotalCount(data.total || 0);
    } catch (err) {
      console.error("Failed to fetch entries:", err);
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    fetchEntries(selectedCategory, dateRange.from, dateRange.to);
  }, [fetchEntries, selectedCategory, dateRange]);

  useEffect(() => {
    const refetch = () => fetchEntries(selectedCategory, dateRange.from, dateRange.to);
    const handleVisibility = () => {
      if (document.visibilityState === "visible") refetch();
    };
    window.addEventListener("focus", refetch);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.removeEventListener("focus", refetch);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [fetchEntries, selectedCategory, dateRange]);

  const handleLoadMore = useCallback(() => {
    if (isLoadingMore) return;
    fetchEntries(selectedCategory, dateRange.from, dateRange.to, entries.length);
  }, [fetchEntries, selectedCategory, dateRange, entries.length, isLoadingMore]);

  const handleCategoryChange = useCallback((category: string | null) => {
    setSelectedCategory(category);
  }, []);

  const handleDateRangeChange = useCallback((from: string | null, to: string | null) => {
    setDateRange({ from, to });
  }, []);

  const handleActionItemToggle = useCallback(
    (entryId: string, index: number, done: boolean) => {
      setEntries((prev) =>
        prev.map((entry) => {
          if (entry.id !== entryId) return entry;
          const updated = [...entry.actionItems];
          updated[index] = { ...updated[index], done };
          return { ...entry, actionItems: updated };
        })
      );

      fetch(`/api/logs/${entryId}/action-items`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ index, done }),
      }).catch(() => {
        setEntries((prev) =>
          prev.map((entry) => {
            if (entry.id !== entryId) return entry;
            const reverted = [...entry.actionItems];
            reverted[index] = { ...reverted[index], done: !done };
            return { ...entry, actionItems: reverted };
          })
        );
      });
    },
    []
  );

  const handleDeleteEntry = useCallback((entryId: string) => {
    const previous = entries;
    setEntries((prev) => prev.filter((e) => e.id !== entryId));
    setTotalCount((prev) => prev - 1);

    fetch(`/api/logs/${entryId}`, { method: "DELETE" }).catch(() => {
      setEntries(previous);
      setTotalCount((prev) => prev + 1);
    });
  }, [entries]);

  const handleEditSummary = useCallback((entryId: string, summary: string) => {
    setEntries((prev) =>
      prev.map((e) => (e.id === entryId ? { ...e, summary } : e))
    );

    fetch(`/api/logs/${entryId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ summary }),
    }).catch(() => {
      fetchEntries(selectedCategory, dateRange.from, dateRange.to);
    });
  }, [fetchEntries, selectedCategory, dateRange]);

  const hasMore = entries.length < totalCount;

  return (
    <div className="py-6 space-y-3">
      <FilterBar
        selectedCategory={selectedCategory}
        onCategoryChange={handleCategoryChange}
        totalCount={totalCount}
        dateFrom={dateRange.from}
        dateTo={dateRange.to}
        onDateRangeChange={handleDateRangeChange}
      />
      <LogFeed
        entries={entries}
        isLoading={isLoading}
        onActionItemToggle={handleActionItemToggle}
        onDeleteEntry={handleDeleteEntry}
        onEditSummary={handleEditSummary}
        onLoadMore={handleLoadMore}
        hasMore={hasMore}
        isLoadingMore={isLoadingMore}
        newEntryIds={newEntryIds}
      />
    </div>
  );
}
