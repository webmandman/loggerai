"use client";

import { useState, useMemo, useCallback } from "react";
import {
  Sparkles,
  Copy,
  Check,
  Circle,
  CheckCircle2,
  ListChecks,
  Quote,
  ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface QueryResultsProps {
  answer: string;
}

interface ExtractedAction {
  id: number;
  text: string;
  checked: boolean;
}

interface ParsedBlock {
  type: "paragraph" | "heading" | "list" | "blockquote";
  content: string;
  level?: number;
  items?: string[];
}

function extractActionsAndBlocks(text: string) {
  const lines = text.split("\n");
  const actions: ExtractedAction[] = [];
  const remaining: string[] = [];
  let actionId = 0;

  for (const line of lines) {
    const trimmed = line.trim();

    const cbMatch = trimmed.match(/^[-*]\s*\[([ xX])\]\s*(.+)/);
    if (cbMatch) {
      actions.push({
        id: actionId++,
        text: cbMatch[2].trim(),
        checked: cbMatch[1].toLowerCase() === "x",
      });
      continue;
    }

    const numCbMatch = trimmed.match(/^\d+[.)]\s*\[([ xX])\]\s*(.+)/);
    if (numCbMatch) {
      actions.push({
        id: actionId++,
        text: numCbMatch[2].trim(),
        checked: numCbMatch[1].toLowerCase() === "x",
      });
      continue;
    }

    remaining.push(line);
  }

  const blocks = parseBlocks(remaining.join("\n"));
  return { actions, blocks };
}

function parseBlocks(text: string): ParsedBlock[] {
  const blocks: ParsedBlock[] = [];
  const sections = text.split(/\n{2,}/);

  for (const section of sections) {
    const trimmed = section.trim();
    if (!trimmed) continue;

    const headingMatch = trimmed.match(/^(#{1,3})\s+(.+)/);
    if (headingMatch) {
      blocks.push({
        type: "heading",
        content: headingMatch[2],
        level: headingMatch[1].length,
      });
      continue;
    }

    if (trimmed.startsWith("> ")) {
      blocks.push({
        type: "blockquote",
        content: trimmed.replace(/^>\s?/gm, ""),
      });
      continue;
    }

    const listLines = trimmed.split("\n");
    const isUnorderedList = listLines.every((l) => /^\s*[-*]\s+/.test(l));
    const isOrderedList = listLines.every((l) => /^\s*\d+[.)]\s+/.test(l));

    if (isUnorderedList || isOrderedList) {
      blocks.push({
        type: "list",
        content: "",
        items: listLines.map((l) => l.replace(/^\s*[-*\d.)+]\s+/, "").trim()),
      });
      continue;
    }

    blocks.push({ type: "paragraph", content: trimmed });
  }

  return blocks;
}

function InlineText({ text }: { text: string }) {
  const parts = useMemo(() => {
    const result: React.ReactNode[] = [];
    const regex = /(\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`)/g;
    let lastIdx = 0;
    let match;
    let key = 0;

    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIdx) {
        result.push(text.slice(lastIdx, match.index));
      }
      if (match[2]) {
        result.push(
          <strong key={key++} className="font-semibold text-foreground">
            {match[2]}
          </strong>
        );
      } else if (match[3]) {
        result.push(
          <em key={key++} className="italic text-foreground/80">
            {match[3]}
          </em>
        );
      } else if (match[4]) {
        result.push(
          <code
            key={key++}
            className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono text-foreground/90"
          >
            {match[4]}
          </code>
        );
      }
      lastIdx = match.index + match[0].length;
    }
    if (lastIdx < text.length) {
      result.push(text.slice(lastIdx));
    }
    return result;
  }, [text]);

  return <>{parts}</>;
}

function RenderBlock({ block }: { block: ParsedBlock }) {
  switch (block.type) {
    case "heading":
      return (
        <h3
          className={cn(
            "font-semibold text-foreground tracking-tight",
            block.level === 1 && "text-base",
            block.level === 2 && "text-[15px]",
            block.level === 3 && "text-sm"
          )}
        >
          <InlineText text={block.content} />
        </h3>
      );

    case "blockquote":
      return (
        <div className="flex gap-3 rounded-lg bg-muted/50 p-3">
          <Quote className="h-4 w-4 shrink-0 text-primary/50 mt-0.5" />
          <p className="text-sm italic leading-relaxed text-foreground/70">
            <InlineText text={block.content} />
          </p>
        </div>
      );

    case "list":
      return (
        <ul className="space-y-1.5 pl-1">
          {block.items?.map((item, i) => (
            <li key={i} className="flex items-start gap-2.5 text-sm leading-relaxed">
              <ArrowRight className="h-3.5 w-3.5 shrink-0 text-primary/60 mt-1" />
              <span className="text-foreground/90">
                <InlineText text={item} />
              </span>
            </li>
          ))}
        </ul>
      );

    case "paragraph":
    default:
      return (
        <p className="text-sm leading-relaxed text-foreground/90">
          <InlineText text={block.content.replace(/\n/g, " ")} />
        </p>
      );
  }
}

export function QueryResults({ answer }: QueryResultsProps) {
  const [copied, setCopied] = useState(false);
  const [checkedItems, setCheckedItems] = useState<Set<number>>(new Set());

  const { actions, blocks } = useMemo(() => extractActionsAndBlocks(answer), [answer]);

  const toggleAction = useCallback((id: number) => {
    setCheckedItems((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(answer);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [answer]);

  const completedCount = checkedItems.size;
  const totalActions = actions.length;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-primary/10 bg-gradient-to-br from-card via-card to-primary/[0.02] shadow-sm animate-in fade-in slide-in-from-top-3 duration-500">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/25 to-transparent" />

      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
          </div>
          <span className="text-xs font-semibold text-primary/70 uppercase tracking-widest">
            AI Answer
          </span>
        </div>

        <button
          onClick={handleCopy}
          className={cn(
            "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all duration-200",
            copied
              ? "bg-green-500/10 text-green-600 dark:text-green-400"
              : "text-muted-foreground/60 hover:text-foreground hover:bg-muted/80"
          )}
        >
          {copied ? (
            <>
              <Check className="h-3 w-3" />
              Copied
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" />
              Copy
            </>
          )}
        </button>
      </div>

      <div className="px-4 pb-4 space-y-3">
        {blocks.map((block, i) => (
          <RenderBlock key={i} block={block} />
        ))}
      </div>

      {totalActions > 0 && (
        <div className="border-t border-primary/10 bg-gradient-to-b from-primary/[0.03] to-transparent">
          <div className="px-4 pt-3 pb-1.5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ListChecks className="h-4 w-4 text-primary/60" />
              <span className="text-xs font-semibold text-foreground/70 uppercase tracking-wider">
                Action Items
              </span>
            </div>
            {totalActions > 1 && (
              <span className="text-[11px] font-medium text-muted-foreground/60 tabular-nums">
                {completedCount}/{totalActions} done
              </span>
            )}
          </div>

          {totalActions > 1 && (
            <div className="mx-4 mb-2">
              <div className="h-1 rounded-full bg-muted/80 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-primary/80 to-primary transition-all duration-500 ease-out"
                  style={{ width: `${(completedCount / totalActions) * 100}%` }}
                />
              </div>
            </div>
          )}

          <div className="px-4 pb-4 space-y-1">
            {actions.map((action) => {
              const done = checkedItems.has(action.id) !== action.checked;
              return (
                <button
                  key={action.id}
                  onClick={() => toggleAction(action.id)}
                  className={cn(
                    "group flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-all duration-200",
                    "hover:bg-primary/[0.04]",
                    done && "opacity-60"
                  )}
                >
                  <div className="mt-0.5 shrink-0">
                    {done ? (
                      <CheckCircle2 className="h-[18px] w-[18px] text-green-500 animate-in zoom-in-50 duration-200" />
                    ) : (
                      <Circle className="h-[18px] w-[18px] text-muted-foreground/40 group-hover:text-primary/60 transition-colors" />
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
                    <InlineText text={action.text} />
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
