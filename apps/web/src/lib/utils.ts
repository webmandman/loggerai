import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import type { ActionItem } from "@logger-ai/shared"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function toLocalDateStr(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function parseLocalDate(dateStr: string): Date | undefined {
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return undefined;
  const date = new Date(+match[1], +match[2] - 1, +match[3], 12, 0, 0);
  return isNaN(date.getTime()) ? undefined : date;
}

export function normalizeActionItems(raw: unknown): ActionItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => {
    if (typeof item === "string") return { text: item, done: false };
    if (item && typeof item === "object" && "text" in item) {
      return { text: String(item.text), done: Boolean(item.done) };
    }
    return { text: String(item), done: false };
  });
}
