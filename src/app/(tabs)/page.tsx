"use client";

import { useState, useCallback } from "react";
import { UnifiedInput } from "@/components/unified-input";
import { QueryResults } from "@/components/query-results";
import { LogResult } from "@/components/log-result";
import type { LogEntry } from "@/types";

export default function HomePage() {
  const [queryAnswer, setQueryAnswer] = useState<string | null>(null);
  const [queryEntries, setQueryEntries] = useState<LogEntry[]>([]);
  const [logEntry, setLogEntry] = useState<LogEntry | null>(null);

  const handleLog = useCallback((entry: LogEntry) => {
    setLogEntry(entry);
    setQueryAnswer(null);
    setQueryEntries([]);
  }, []);

  const handleQueryResult = useCallback((answer: string, entries: LogEntry[]) => {
    setQueryAnswer(answer);
    setQueryEntries(entries);
    setLogEntry(null);
  }, []);

  const handleClearQuery = useCallback(() => {
    setQueryAnswer(null);
    setQueryEntries([]);
  }, []);

  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-8rem)] py-8">
      <div className="w-full max-w-lg space-y-4">
        <UnifiedInput
          onLog={handleLog}
          onQueryResult={handleQueryResult}
          onClearQuery={handleClearQuery}
          hasActiveQuery={!!queryAnswer}
        />

        {queryAnswer && <QueryResults answer={queryAnswer} entries={queryEntries} />}

        {logEntry && <LogResult entry={logEntry} />}
      </div>
    </div>
  );
}
