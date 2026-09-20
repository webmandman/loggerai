"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertCircle, ArrowLeft, Check, Loader2, Save, Sparkles } from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { PREFERENCES_MAX } from "@/lib/preferences";

/** Tap to drop a line in — a blank box is hard to start from. */
const EXAMPLES = [
  "We like bold, spicy food. Mild is boring.",
  "Nothing that takes more than 30 minutes on a weeknight.",
  "The kids will not touch mushrooms or olives.",
  "We eat a lot of Mexican and Thai. More of that.",
  "One of us hates cilantro.",
  "Prefer one-pan dinners — we hate washing up.",
];

export default function PreferencesPage() {
  const [text, setText] = useState("");
  // What is in the database, so the save button knows whether anything moved.
  const [saved, setSaved] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await api("/api/preferences");
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Could not load your preferences");
        setText(data.preferences);
        setSaved(data.preferences);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load your preferences");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const save = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await api("/api/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preferences: text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save that");
      // Take the server's copy: it trims and caps, so what came back is what
      // the next suggestion will actually be told.
      setText(data.preferences);
      setSaved(data.preferences);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save that");
    } finally {
      setSaving(false);
    }
  }, [text]);

  const addExample = (line: string) =>
    setText((prev) => (prev.trim() ? `${prev.replace(/\s+$/, "")}\n${line}` : line));

  const dirty = text !== saved;

  return (
    <div className="py-6 space-y-4">
      <Link
        href="/recipes"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to recipes
      </Link>

      <div>
        <h2 className="text-lg font-semibold tracking-tight">Taste and preferences</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Anything here is told to the model every time it suggests recipes.
          Write it like you would tell a cook who is new to the house.
        </p>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-destructive/20 bg-destructive/10 px-3 py-2.5">
          <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
          <p className="text-sm text-destructive flex-1">{error}</p>
        </div>
      )}

      <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
        {loading ? (
          <div className="h-44 rounded-xl bg-muted/40 animate-pulse" />
        ) : (
          <>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value.slice(0, PREFERENCES_MAX))}
              rows={9}
              placeholder="We like bold, spicy food. No mushrooms. Weeknights need to be under 30 minutes."
              className="w-full resize-y rounded-xl border border-border bg-background px-3 py-2.5 text-sm leading-relaxed outline-none focus:ring-2 focus:ring-primary/30"
            />
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Taste only — the diet toggles stay in charge.</span>
              <span className="tabular-nums">
                {text.length}/{PREFERENCES_MAX}
              </span>
            </div>
          </>
        )}

        <button
          onClick={save}
          disabled={saving || loading || !dirty}
          className={cn(
            "w-full flex items-center justify-center gap-2 rounded-2xl px-4 py-3",
            "font-medium transition-all duration-200",
            saving || loading || !dirty
              ? "bg-muted text-muted-foreground"
              : "bg-primary text-primary-foreground shadow-md hover:shadow-lg active:scale-[0.99]"
          )}
        >
          {saving ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              Saving
            </>
          ) : dirty ? (
            <>
              <Save className="h-5 w-5" />
              Save preferences
            </>
          ) : (
            <>
              <Check className="h-5 w-5" />
              Saved
            </>
          )}
        </button>
      </div>

      <div>
        <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-2">
          <Sparkles className="h-3.5 w-3.5" />
          Ideas — tap to add a line
        </p>
        <div className="flex flex-wrap gap-2">
          {EXAMPLES.map((line) => (
            <button
              key={line}
              onClick={() => addExample(line)}
              disabled={loading || text.includes(line)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs text-left transition-colors",
                text.includes(line)
                  ? "border-border/50 text-muted-foreground/40"
                  : "border-border text-muted-foreground hover:text-foreground hover:bg-accent"
              )}
            >
              {line}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
