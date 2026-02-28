"use client";

import { Sparkles } from "lucide-react";

interface QueryResultsProps {
  answer: string;
}

export function QueryResults({ answer }: QueryResultsProps) {
  return (
    <div className="relative rounded-xl border border-primary/15 bg-gradient-to-br from-primary/5 via-transparent to-primary/5 p-4 animate-in fade-in slide-in-from-top-2 duration-300">
      <div className="flex gap-3">
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
        </div>
        <div className="space-y-1 pt-0.5">
          <p className="text-xs font-medium text-primary/70 uppercase tracking-wider">
            AI Answer
          </p>
          <p className="text-sm leading-relaxed text-foreground/90">{answer}</p>
        </div>
      </div>
    </div>
  );
}
