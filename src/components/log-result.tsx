"use client";

import { useState, useCallback } from "react";
import {
  CheckCircle2,
  Circle,
  Hash,
  Smile,
  Frown,
  Meh,
  Zap,
  Heart,
  Brain,
  AlertTriangle,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import type { LogEntry } from "@/types";

interface LogResultProps {
  entry: LogEntry;
}

const moodConfig: Record<string, { icon: typeof Smile; color: string; bg: string }> = {
  positive: { icon: Smile, color: "text-green-500", bg: "bg-green-500/10" },
  excited: { icon: Zap, color: "text-amber-500", bg: "bg-amber-500/10" },
  happy: { icon: Smile, color: "text-green-500", bg: "bg-green-500/10" },
  grateful: { icon: Heart, color: "text-pink-500", bg: "bg-pink-500/10" },
  neutral: { icon: Meh, color: "text-muted-foreground", bg: "bg-muted/60" },
  focused: { icon: Brain, color: "text-blue-500", bg: "bg-blue-500/10" },
  frustrated: { icon: Frown, color: "text-orange-500", bg: "bg-orange-500/10" },
  anxious: { icon: AlertTriangle, color: "text-amber-600", bg: "bg-amber-600/10" },
  negative: { icon: Frown, color: "text-red-500", bg: "bg-red-500/10" },
  tired: { icon: Clock, color: "text-purple-500", bg: "bg-purple-500/10" },
};

function getMoodConfig(mood: string | null) {
  if (!mood) return null;
  return moodConfig[mood.toLowerCase()] ?? { icon: Meh, color: "text-muted-foreground", bg: "bg-muted/60" };
}

export function LogResult({ entry }: LogResultProps) {
  const [checkedItems, setCheckedItems] = useState<Set<number>>(new Set());
  const moodCfg = getMoodConfig(entry.mood);
  const MoodIcon = moodCfg?.icon;
  const hasActionItems = entry.actionItems.length > 0;
  const hasTags = entry.tags.length > 0;
  const hasExtras = hasActionItems || hasTags || entry.mood;

  const toggleAction = useCallback((idx: number) => {
    setCheckedItems((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }, []);

  return (
    <div className="overflow-hidden rounded-2xl border border-green-500/15 bg-gradient-to-br from-card via-card to-green-500/[0.02] shadow-sm animate-in fade-in slide-in-from-bottom-3 duration-500">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-green-500/20 to-transparent" />

      <div className="flex items-start gap-3 p-4">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-green-500/10">
          <CheckCircle2 className="h-4 w-4 text-green-500" />
        </div>
        <div className="flex-1 min-w-0 space-y-2">
          <p className="text-sm font-medium leading-snug text-foreground">
            {entry.summary}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="text-xs capitalize">
              {entry.category}
            </Badge>
            {moodCfg && MoodIcon && (
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium capitalize",
                  moodCfg.bg,
                  moodCfg.color
                )}
              >
                <MoodIcon className="h-3 w-3" />
                {entry.mood}
              </span>
            )}
            <span className="text-[11px] text-muted-foreground/50">
              Saved to feed
            </span>
          </div>
        </div>
      </div>

      {hasExtras && (
        <div className="border-t border-green-500/10">
          {hasActionItems && (
            <div className="px-4 pt-3 pb-2 space-y-1">
              <span className="text-[11px] font-semibold text-foreground/50 uppercase tracking-wider">
                Action items
              </span>
              {entry.actionItems.map((item, i) => {
                const done = checkedItems.has(i);
                return (
                  <button
                    key={i}
                    onClick={() => toggleAction(i)}
                    className={cn(
                      "group flex w-full items-start gap-2.5 rounded-lg px-2 py-1.5 text-left transition-all duration-200",
                      "hover:bg-green-500/[0.04]",
                      done && "opacity-60"
                    )}
                  >
                    <div className="mt-0.5 shrink-0">
                      {done ? (
                        <CheckCircle2 className="h-4 w-4 text-green-500 animate-in zoom-in-50 duration-200" />
                      ) : (
                        <Circle className="h-4 w-4 text-muted-foreground/40 group-hover:text-green-500/60 transition-colors" />
                      )}
                    </div>
                    <span
                      className={cn(
                        "text-sm leading-relaxed transition-all duration-200",
                        done
                          ? "line-through text-muted-foreground/50"
                          : "text-foreground/85"
                      )}
                    >
                      {item.text}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {hasTags && (
            <div className="px-4 pb-3 pt-1 flex flex-wrap gap-1.5">
              {entry.tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 rounded-md bg-muted/60 px-2 py-0.5 text-[11px] text-muted-foreground/70"
                >
                  <Hash className="h-2.5 w-2.5" />
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
