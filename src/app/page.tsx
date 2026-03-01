"use client";

import { useState, useEffect, useCallback } from "react";
import { BookOpen } from "lucide-react";
import { UnifiedInput } from "@/components/unified-input";
import { LogFeed } from "@/components/log-feed";
import { QueryResults } from "@/components/query-results";
import { FilterBar } from "@/components/filter-bar";
import { Separator } from "@/components/ui/separator";
import type { LogEntry } from "@/types";

export default function Home() {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [queryAnswer, setQueryAnswer] = useState<string | null>(null);
  const [highlightedIds, setHighlightedIds] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const fetchEntries = useCallback(async (category?: string | null) => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (category) params.set("category", category);
      const res = await fetch(`/api/logs?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setEntries(data.entries || []);
      setTotalCount(data.total || 0);
    } catch (err) {
      console.error("Failed to fetch entries:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEntries(selectedCategory);
  }, [fetchEntries, selectedCategory]);

  const handleLog = useCallback((entry: LogEntry) => {
    setEntries((prev) => [entry, ...prev]);
    setTotalCount((prev) => prev + 1);
  }, []);

  const handleQueryResult = useCallback(
    (answer: string, relevantEntries: LogEntry[]) => {
      setQueryAnswer(answer);
      if (relevantEntries.length) {
        setHighlightedIds(relevantEntries.map((e) => e.id));
      } else {
        setHighlightedIds([]);
      }
    },
    []
  );

  const handleClearQuery = useCallback(() => {
    setQueryAnswer(null);
    setHighlightedIds([]);
  }, []);

  const handleCategoryChange = useCallback((category: string | null) => {
    setSelectedCategory(category);
    setQueryAnswer(null);
    setHighlightedIds([]);
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

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur-md">
        <div className="mx-auto max-w-2xl px-4 py-4">
          <div className="flex items-center gap-2">
            <BookOpen className="h-6 w-6 text-primary" />
            <h1 className="text-xl font-bold tracking-tight">Logger.ai</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            Log anything by voice or text — AI does the rest
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-6 space-y-6">
        <section className="space-y-3">
          <UnifiedInput
            onLog={handleLog}
            onQueryResult={handleQueryResult}
            onClearQuery={handleClearQuery}
            hasActiveQuery={!!queryAnswer}
          />
          {queryAnswer && <QueryResults answer={queryAnswer} />}
        </section>

        <Separator />

        <section className="space-y-3">
          <FilterBar
            selectedCategory={selectedCategory}
            onCategoryChange={handleCategoryChange}
            totalCount={totalCount}
          />
          <LogFeed
            entries={entries}
            isLoading={isLoading}
            highlightedIds={highlightedIds}
            onActionItemToggle={handleActionItemToggle}
          />
        </section>
      </main>
    </div>
  );
}
