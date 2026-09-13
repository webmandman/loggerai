"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  Check,
  ChevronDown,
  Clock,
  Loader2,
  Plus,
  RefreshCw,
  ShoppingBasket,
  Users,
} from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { Recipe } from "@/types";

export default function RecipesPage() {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [pantryCount, setPantryCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api("/api/recipes");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not suggest recipes");
      setRecipes(data.recipes);
      setPantryCount(data.pantryCount);
      setOpen(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not suggest recipes");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="py-6 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold">Recipes</h2>
          <p className="text-sm text-muted-foreground">
            {loading
              ? "Reading your pantry..."
              : `From the ${pantryCount} item${pantryCount === 1 ? "" : "s"} you have in stock`}
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          aria-label="Suggest different recipes"
          className={cn(
            "shrink-0 flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium transition-colors",
            loading ? "bg-muted text-muted-foreground cursor-wait" : "bg-muted hover:bg-accent"
          )}
        >
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          Shuffle
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-destructive/20 bg-destructive/10 px-3 py-2.5">
          <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
          <p className="text-sm text-destructive flex-1">{error}</p>
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-24 rounded-2xl bg-muted/50 animate-pulse" />
          ))}
        </div>
      ) : recipes.length === 0 && !error ? (
        <EmptyState count={pantryCount} />
      ) : (
        <ul className="space-y-3">
          {recipes.map((r) => (
            <RecipeCard
              key={r.title}
              recipe={r}
              expanded={open === r.title}
              onToggle={() => setOpen(open === r.title ? null : r.title)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function RecipeCard({
  recipe,
  expanded,
  onToggle,
}: {
  recipe: Recipe;
  expanded: boolean;
  onToggle: () => void;
}) {
  const missing = recipe.ingredients.filter((i) => !i.have);
  const [added, setAdded] = useState(false);
  const [adding, setAdding] = useState(false);

  const addMissing = async () => {
    setAdding(true);
    // One POST per item: the manual-add endpoint takes a single label, and a
    // recipe is short enough that a bulk route would be more code than this.
    const results = await Promise.all(
      missing.map((m) =>
        api("/api/pantry", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ label: m.item, status: "needed" }),
        })
      )
    );
    setAdding(false);
    // The pantry endpoint rejects anything that does not read as a food item,
    // so only claim success when every one of them landed.
    setAdded(results.every((r) => r.ok));
  };

  return (
    <li className="rounded-2xl border border-border bg-card overflow-hidden">
      <button
        onClick={onToggle}
        aria-expanded={expanded}
        className="w-full text-left px-4 py-3.5 hover:bg-accent/40 transition-colors"
      >
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <h3 className="font-medium leading-tight">{recipe.title}</h3>
            <p className="text-sm text-muted-foreground mt-1">{recipe.description}</p>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />
                {recipe.minutes} min
              </span>
              <span className="flex items-center gap-1">
                <Users className="h-3.5 w-3.5" />
                serves {recipe.servings}
              </span>
              {missing.length === 0 ? (
                <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                  <Check className="h-3.5 w-3.5" />
                  you have everything
                </span>
              ) : (
                <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                  <ShoppingBasket className="h-3.5 w-3.5" />
                  need {missing.length} more
                </span>
              )}
            </div>
          </div>
          <ChevronDown
            className={cn(
              "h-4 w-4 shrink-0 mt-1 text-muted-foreground/50 transition-transform",
              expanded && "rotate-180"
            )}
          />
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-4 animate-in fade-in duration-150">
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              Ingredients
            </h4>
            <ul className="space-y-1">
              {recipe.ingredients.map((ing) => (
                <li key={ing.item} className="flex items-baseline gap-2 text-sm">
                  <span
                    className={cn(
                      "h-1.5 w-1.5 shrink-0 rounded-full",
                      ing.have ? "bg-emerald-500" : "bg-amber-500"
                    )}
                  />
                  <span className={cn("flex-1", !ing.have && "text-muted-foreground")}>
                    {ing.item}
                  </span>
                  {ing.amount && (
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {ing.amount}
                    </span>
                  )}
                </li>
              ))}
            </ul>

            {missing.length > 0 && (
              <button
                onClick={addMissing}
                disabled={adding || added}
                className={cn(
                  "mt-3 flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors",
                  added
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-primary hover:bg-primary/10"
                )}
              >
                {adding ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : added ? (
                  <Check className="h-3.5 w-3.5" />
                ) : (
                  <Plus className="h-3.5 w-3.5" />
                )}
                {added
                  ? "On your shopping list"
                  : `Add ${missing.length} missing to shopping list`}
              </button>
            )}
          </div>

          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              Method
            </h4>
            <ol className="space-y-2">
              {recipe.steps.map((step, i) => (
                <li key={i} className="flex gap-3 text-sm">
                  <span className="shrink-0 h-5 w-5 rounded-full bg-muted flex items-center justify-center text-[11px] font-medium tabular-nums">
                    {i + 1}
                  </span>
                  <span className="flex-1 leading-relaxed">{step}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </li>
  );
}

function EmptyState({ count }: { count: number }) {
  return (
    <div className="text-center py-12 px-6">
      <ShoppingBasket className="h-8 w-8 mx-auto mb-3 text-muted-foreground/25" />
      <p className="text-sm text-muted-foreground/70">
        {count < 3 ? "Not enough in the pantry yet." : "No recipes came back."}
      </p>
      <p className="text-xs text-muted-foreground/50 mt-1">
        {count < 3
          ? "Scan a receipt or say what is in your fridge, then come back."
          : "Hit shuffle to try again."}
      </p>
    </div>
  );
}
