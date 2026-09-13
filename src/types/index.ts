export interface ActionItem {
  text: string;
  done: boolean;
}

export interface PantryInput {
  name: string;
  label: string;
  quantity?: string | null;
  /** Other everyday names for the same item, e.g. ["creamer"] on half and half. */
  aliases?: string[];
}

export interface PantryItem {
  id: string;
  name: string;
  label: string;
  aliases: string[];
  quantity: string | null;
  status: "available" | "needed";
  source: string;
  createdAt: string;
  updatedAt: string;
}

export interface ReceiptScan {
  store: string | null;
  purchasedAt: string | null;
  items: PantryInput[];
}

export interface ProcessedLogEntry {
  summary: string;
  category: string;
  tags: string[];
  actionItems: ActionItem[];
  mood: string | null;
  metadata: Record<string, unknown>;
  occurredAt: string | null;
  /** Food the entry says is now gone — gets pushed onto the shopping list. */
  consumed: PantryInput[];
}

export interface LogEntry {
  id: string;
  rawInput: string;
  summary: string;
  category: string;
  tags: string[];
  actionItems: ActionItem[];
  metadata: Record<string, unknown>;
  mood: string | null;
  inputMethod: string;
  createdAt: string;
  updatedAt: string;
  user?: {
    id: string;
    name: string | null;
    image: string | null;
  } | null;
}

export interface QueryResult {
  answer: string;
  relevantEntryIds: string[];
}

export type InputMethod = "voice" | "text";

export const CATEGORIES = [
  "task",
  "idea",
  "meeting",
  "personal",
  "note",
  "reminder",
  "bug",
  "question",
  "achievement",
  "grocery",
  "other",
] as const;

export type Category = (typeof CATEGORIES)[number];
