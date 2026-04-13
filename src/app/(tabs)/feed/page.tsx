"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { LogFeed } from "@/components/log-feed";
import { FilterBar } from "@/components/filter-bar";
import { api } from "@/lib/api";
import type { LogEntry } from "@/types";

const PAGE_SIZE = 20;

export default function FeedPage() {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<{ from: string | null; to: string | null }>({ from: null, to: null });
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [newEntryIds, setNewEntryIds] = useState<string[]>([]);
  const newEntryTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const fetchEntries = useCallback(async (category?: string | null, from?: string | null, to?: string | null, userId?: string | null, offset = 0) => {
    if (offset === 0) setIsLoading(true);
    else setIsLoadingMore(true);

    try {
      const params = new URLSearchParams();
      if (category) params.set("category", category);
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      if (userId) params.set("userId", userId);
      params.set("limit", String(PAGE_SIZE));
      params.set("offset", String(offset));

      const res = await api(`/api/logs?${params.toString()}`, {
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
    fetchEntries(selectedCategory, dateRange.from, dateRange.to, selectedUser);
  }, [fetchEntries, selectedCategory, dateRange, selectedUser]);

  useEffect(() => {
    const refetch = () => fetchEntries(selectedCategory, dateRange.from, dateRange.to, selectedUser);
    const handleVisibility = () => {
      if (document.visibilityState === "visible") refetch();
    };
    window.addEventListener("focus", refetch);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.removeEventListener("focus", refetch);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [fetchEntries, selectedCategory, dateRange, selectedUser]);

  const handleLoadMore = useCallback(() => {
    if (isLoadingMore) return;
    fetchEntries(selectedCategory, dateRange.from, dateRange.to, selectedUser, entries.length);
  }, [fetchEntries, selectedCategory, dateRange, selectedUser, entries.length, isLoadingMore]);

  const handleCategoryChange = useCallback((category: string | null) => {
    setSelectedCategory(category);
  }, []);

  const handleDateRangeChange = useCallback((from: string | null, to: string | null) => {
    setDateRange({ from, to });
  }, []);

  const handleUserChange = useCallback((userId: string | null) => {
    setSelectedUser(userId);
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

      api(`/api/logs/${entryId}/action-items`, {
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

    api(`/api/logs/${entryId}`, { method: "DELETE" }).catch(() => {
      setEntries(previous);
      setTotalCount((prev) => prev + 1);
    });
  }, [entries]);

  const handleEditSummary = useCallback((entryId: string, summary: string) => {
    setEntries((prev) =>
      prev.map((e) => (e.id === entryId ? { ...e, summary } : e))
    );

    api(`/api/logs/${entryId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ summary }),
    }).catch(() => {
      fetchEntries(selectedCategory, dateRange.from, dateRange.to, selectedUser);
    });
  }, [fetchEntries, selectedCategory, dateRange, selectedUser]);

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
        selectedUser={selectedUser}
        onUserChange={handleUserChange}
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
