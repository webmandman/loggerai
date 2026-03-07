"use client";

import { Circle, CheckCircle2 } from "lucide-react";
import type { ActionItem } from "@logger-ai/shared";

interface ActionItemListProps {
  items: ActionItem[];
  entryId: string;
  onToggle: (entryId: string, index: number, done: boolean) => void;
}

export function ActionItemList({ items, entryId, onToggle }: ActionItemListProps) {
  if (items.length === 0) return null;

  return (
    <div className="space-y-0.5">
      {items.map((item, i) => (
        <button
          key={i}
          type="button"
          className="flex items-start gap-1.5 text-sm w-full text-left group/action rounded-sm px-1 -mx-1 py-0.5 transition-colors hover:bg-muted/50"
          onClick={() => onToggle(entryId, i, !item.done)}
        >
          <span className="relative mt-0.5 shrink-0">
            <Circle
              className={`h-3.5 w-3.5 transition-all duration-300 ${
                item.done
                  ? "opacity-0 scale-50"
                  : "opacity-100 scale-100 text-muted-foreground group-hover/action:text-foreground"
              }`}
            />
            <CheckCircle2
              className={`h-3.5 w-3.5 absolute inset-0 transition-all duration-300 ${
                item.done
                  ? "opacity-100 scale-100 text-emerald-500 animate-check-bounce"
                  : "opacity-0 scale-50"
              }`}
            />
          </span>
          <span
            className={`relative transition-all duration-300 ${
              item.done ? "text-muted-foreground/50" : "text-muted-foreground group-hover/action:text-foreground"
            }`}
          >
            {item.text}
            <span
              className={`absolute left-0 top-1/2 h-px bg-muted-foreground/50 origin-left transition-transform duration-400 ease-out ${
                item.done ? "scale-x-100" : "scale-x-0"
              }`}
              style={{ width: "100%" }}
            />
          </span>
        </button>
      ))}
    </div>
  );
}
