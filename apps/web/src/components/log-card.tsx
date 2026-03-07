"use client";

import { useState, useRef, useEffect } from "react";
import {
  ChevronDown,
  ChevronUp,
  Mic,
  Keyboard,
  Trash2,
  Pencil,
  Check,
  X,
} from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ActionItemList } from "@/components/action-item-list";
import type { LogEntry } from "@logger-ai/shared";

const METADATA_SKIP_KEYS = new Set([
  "physicalNotes", "notes", "sentiment", "description", "details",
]);

const UNIT_SUFFIXES: Record<string, string> = {
  Minutes: " min", Hours: " hr", Km: " km", Mi: " mi", Seconds: " sec",
};

function formatMetaPill(key: string, value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) return value.length > 0 ? value.join(", ") : null;

  for (const [suffix, unit] of Object.entries(UNIT_SUFFIXES)) {
    if (key.endsWith(suffix)) return `${value}${unit}`;
  }

  if (typeof value === "number") {
    const label = key.replace(/([A-Z])/g, " $1").toLowerCase().trim();
    return `${value} ${label}`;
  }

  return String(value);
}

function MetadataPills({ metadata }: { metadata: Record<string, unknown> }) {
  const pills = Object.entries(metadata)
    .filter(([key]) => !METADATA_SKIP_KEYS.has(key))
    .map(([key, val]) => ({ key, text: formatMetaPill(key, val) }))
    .filter((p): p is { key: string; text: string } => p.text !== null);

  if (pills.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1">
      {pills.slice(0, 5).map(({ key, text }) => (
        <span
          key={key}
          className="inline-flex items-center rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground"
        >
          {text}
        </span>
      ))}
    </div>
  );
}

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
  onActionItemToggle?: (entryId: string, index: number, done: boolean) => void;
  onDelete?: (entryId: string) => void;
  onEditSummary?: (entryId: string, summary: string) => void;
  className?: string;
}

export function LogCard({ entry, onActionItemToggle, onDelete, onEditSummary, className }: LogCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(entry.summary);
  const editInputRef = useRef<HTMLInputElement>(null);

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

  useEffect(() => {
    if (isEditing && editInputRef.current) editInputRef.current.focus();
  }, [isEditing]);

  const handleSaveEdit = () => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== entry.summary && onEditSummary) {
      onEditSummary(entry.id, trimmed);
    }
    setIsEditing(false);
  };

  return (
    <Card
      className={`transition-all hover:shadow-md ${className || ""}`}
    >
      <CardHeader className="pb-2 pt-4 px-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0 group/summary">
            {isEditing ? (
              <div className="flex items-center gap-1">
                <input
                  ref={editInputRef}
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSaveEdit();
                    if (e.key === "Escape") { setIsEditing(false); setEditValue(entry.summary); }
                  }}
                  className="flex-1 text-sm font-medium bg-transparent border-b border-primary outline-none py-0.5"
                />
                <button onClick={handleSaveEdit} className="p-0.5 text-primary hover:text-primary/80">
                  <Check className="h-3.5 w-3.5" />
                </button>
                <button onClick={() => { setIsEditing(false); setEditValue(entry.summary); }} className="p-0.5 text-muted-foreground hover:text-foreground">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <p className="text-sm font-medium leading-snug">
                {entry.summary}
                {onEditSummary && (
                  <button
                    onClick={() => setIsEditing(true)}
                    className="inline-flex ml-1.5 opacity-0 group-hover/summary:opacity-100 transition-opacity text-muted-foreground hover:text-foreground align-middle"
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                )}
              </p>
            )}
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

        {entry.metadata && Object.keys(entry.metadata).length > 0 && (
          <MetadataPills metadata={entry.metadata} />
        )}

        {entry.actionItems.length > 0 && onActionItemToggle && (
          <ActionItemList
            items={entry.actionItems}
            entryId={entry.id}
            onToggle={onActionItemToggle}
          />
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
          <div className="pt-2 border-t space-y-2">
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">
              {entry.rawInput}
            </p>
            {onDelete && (
              <div className="flex justify-end">
                {confirmDelete ? (
                  <div className="flex items-center gap-2 animate-in fade-in duration-150">
                    <span className="text-xs text-muted-foreground">Delete this entry?</span>
                    <Button variant="destructive" size="sm" className="h-6 px-2 text-xs" onClick={() => { onDelete(entry.id); setConfirmDelete(false); }}>
                      Yes, delete
                    </Button>
                    <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => setConfirmDelete(false)}>
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <Button variant="ghost" size="sm" className="h-6 px-2 text-xs text-muted-foreground hover:text-destructive" onClick={() => setConfirmDelete(true)}>
                    <Trash2 className="h-3 w-3 mr-1" />
                    Delete
                  </Button>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
