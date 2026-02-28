export interface ProcessedLogEntry {
  summary: string;
  category: string;
  tags: string[];
  actionItems: string[];
  mood: string | null;
}

export interface LogEntry {
  id: string;
  rawInput: string;
  summary: string;
  category: string;
  tags: string[];
  actionItems: string[];
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
