export interface ActionItem {
  text: string;
  done: boolean;
}

export interface ProcessedLogEntry {
  summary: string;
  category: string;
  tags: string[];
  actionItems: ActionItem[];
  mood: string | null;
  metadata: Record<string, unknown>;
  occurredAt: string | null;
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
  "other",
] as const;

export type Category = (typeof CATEGORIES)[number];
