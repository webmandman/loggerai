"use client";

import { useState, useCallback, useRef } from "react";
import { CheckCircle2 } from "lucide-react";
import { UnifiedInput } from "@/components/unified-input";
import { QueryResults } from "@/components/query-results";
import { Badge } from "@/components/ui/badge";
import type { LogEntry } from "@/types";

export default function HomePage() {
  const [queryAnswer, setQueryAnswer] = useState<string | null>(null);
  const [toast, setToast] = useState<LogEntry | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const handleLog = useCallback((entry: LogEntry) => {
    setToast(entry);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  }, []);

  const handleQueryResult = useCallback(
    (answer: string) => {
      setQueryAnswer(answer);
    },
    []
  );

  const handleClearQuery = useCallback(() => {
    setQueryAnswer(null);
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

        {queryAnswer && <QueryResults answer={queryAnswer} />}

        {toast && (
          <div className="flex items-start gap-3 rounded-xl border border-green-500/20 bg-green-500/5 p-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{toast.summary}</p>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="secondary" className="text-xs">
                  {toast.category}
                </Badge>
                <span className="text-xs text-muted-foreground">Saved to feed</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
