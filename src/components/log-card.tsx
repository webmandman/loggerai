"use client";

import { useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Mic,
  Keyboard,
  Circle,
} from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { LogEntry } from "@/types";

const CATEGORY_COLORS: Record<string, string> = {
  task: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  idea: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  meeting: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  personal: "bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200",
  note: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
  reminder: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  bug: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  question: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200",
  achievement: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  other: "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200",
};

const MOOD_EMOJI: Record<string, string> = {
  positive: "😊",
  excited: "🎉",
  neutral: "😐",
  frustrated: "😤",
  anxious: "😰",
  sad: "😢",
  happy: "😄",
  calm: "😌",
  confused: "🤔",
  determined: "💪",
};

interface LogCardProps {
  entry: LogEntry;
  highlighted?: boolean;
}

export function LogCard({ entry, highlighted = false }: LogCardProps) {
  const [expanded, setExpanded] = useState(false);

  const date = new Date(entry.createdAt);
  const timeStr = date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
  const dateStr = date.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <Card
      className={`transition-all ${
        highlighted
          ? "ring-2 ring-primary shadow-lg"
          : "hover:shadow-md"
      }`}
    >
      <CardHeader className="pb-2 pt-4 px-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium leading-snug">
              {entry.summary}
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {entry.mood && MOOD_EMOJI[entry.mood] && (
              <span title={entry.mood} className="text-base">
                {MOOD_EMOJI[entry.mood]}
              </span>
            )}
            <Badge
              variant="secondary"
              className={`text-xs ${CATEGORY_COLORS[entry.category] || CATEGORY_COLORS.other}`}
            >
              {entry.category}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0 px-4 pb-3 space-y-2">
        {entry.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {entry.tags.map((tag) => (
              <Badge
                key={tag}
                variant="outline"
                className="text-xs font-normal"
              >
                #{tag}
              </Badge>
            ))}
          </div>
        )}

        {entry.actionItems.length > 0 && (
          <div className="space-y-1">
            {entry.actionItems.map((item, i) => (
              <div key={i} className="flex items-start gap-1.5 text-sm">
                <Circle className="h-3.5 w-3.5 mt-0.5 text-muted-foreground shrink-0" />
                <span className="text-muted-foreground">{item}</span>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
          <div className="flex items-center gap-2">
            <span>{dateStr} at {timeStr}</span>
            {entry.inputMethod === "voice" ? (
              <Mic className="h-3 w-3" />
            ) : (
              <Keyboard className="h-3 w-3" />
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? (
              <>
                <ChevronUp className="h-3 w-3 mr-1" />
                Less
              </>
            ) : (
              <>
                <ChevronDown className="h-3 w-3 mr-1" />
                More
              </>
            )}
          </Button>
        </div>

        {expanded && (
          <div className="pt-2 border-t">
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">
              {entry.rawInput}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
