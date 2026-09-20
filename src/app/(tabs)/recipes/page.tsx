"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  Bookmark,
  CalendarPlus,
  Check,
  ChefHat,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Loader2,
  Plus,
  SlidersHorizontal,
  Sparkles,
  Star,
  Users,
  X,
} from "lucide-react";
import { api } from "@/lib/api";
import { cn, toLocalDateStr } from "@/lib/utils";
import { dayLabel, MEAL_SLOTS, shiftDateStr } from "@/lib/plan";
import {
  defaultRecipeOptions,
  type DayPlan,
  type Meal,
  type Recipe,
  type RecipeOptions,
  type SavedRecipe,
} from "@/types";

type Tab = "suggest" | "saved";

const SERVINGS = [1, 2, 3, 4, 5];
const MISSING = [1, 2, 3];

type DietKey = "lactoseFree" | "glutenFree" | "carbHeavy" | "proteinHeavy";

const DIETS: Array<{ key: DietKey; label: string }> = [
  { key: "lactoseFree", label: "Lactose free" },
  { key: "glutenFree", label: "Gluten free" },
  { key: "carbHeavy", label: "Carb heavy" },
  { key: "proteinHeavy", label: "Protein heavy" },
];

export default function RecipesPage() {
  const [tab, setTab] = useState<Tab>("suggest");
  // Null until mounted: the meal default reads the clock, and this page is
  // prerendered, so choosing it during SSR would hydrate against the build
  // machine's hour instead of the cook's.
  const [options, setOptions] = useState<RecipeOptions | null>(null);
  const [suggestions, setSuggestions] = useState<Recipe[] | null>(null);
  const [pantryCount, setPantryCount] = useState<number | null>(null);
  const [saved, setSaved] = useState<SavedRecipe[]>([]);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  // The recipe whose "add to plan" sheet is up, null when the sheet is closed.
  const [planning, setPlanning] = useState<SavedRecipe | null>(null);

  useEffect(() => {
    // The clock is only readable once we are on the cook's device.
    setOptions(defaultRecipeOptions());
  }, []);

  const loadSaved = useCallback(async () => {
    const res = await api("/api/recipes");
    if (!res.ok) return;
    const data = await res.json();
    setSaved(data.recipes);
  }, []);

  useEffect(() => {
    loadSaved();
  }, [loadSaved]);

  const generate = useCallback(async () => {
    if (!options) return;
    setGenerating(true);
    setError(null);
    setOpen(null);

    try {
      const res = await api("/api/recipes/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(options),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not suggest recipes");
      setSuggestions(data.recipes);
      setPantryCount(data.pantryCount);
      // Kept recipes came back but generating the rest failed: show both.
      if (data.error) setError(data.error);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not suggest recipes");
    } finally {
      setGenerating(false);
    }
  }, [options]);

  const savedByTitle = useMemo(
    () => new Map(saved.map((s) => [s.title, s])),
    [saved]
  );

  const toggleSave = useCallback(
    async (recipe: Recipe) => {
      const existing = savedByTitle.get(recipe.title);

      if (existing) {
        setSaved((prev) => prev.filter((s) => s.id !== existing.id));
        const res = await api(`/api/recipes/${existing.id}`, { method: "DELETE" });
        if (!res.ok) {
          setError("Could not remove that recipe");
          loadSaved();
        }
        return;
      }

      const res = await api("/api/recipes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(recipe),
      });
      if (!res.ok) {
        setError("Could not save that recipe");
        return;
      }
      const row: SavedRecipe = await res.json();
      setSaved((prev) => [row, ...prev]);
    },
    [savedByTitle, loadSaved]
  );

  /**
   * The saved row for a recipe, saving it first if it is only a suggestion.
   *
   * Starring and planning both need a row with an id. Making the cook save
   * first would be two taps for something they have already decided on, so
   * the save rides along.
   */
  const ensureSaved = useCallback(
    async (recipe: Recipe): Promise<SavedRecipe | null> => {
      const existing = savedByTitle.get(recipe.title);
      if (existing) return existing;

      const res = await api("/api/recipes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(recipe),
      });
      if (!res.ok) {
        setError("Could not save that recipe");
        return null;
      }
      const row: SavedRecipe = await res.json();
      setSaved((prev) => [row, ...prev]);
      return row;
    },
    [savedByTitle]
  );

  const toggleFavorite = useCallback(
    async (recipe: Recipe) => {
      const item = await ensureSaved(recipe);
      if (!item) return;

      const favorite = !item.favorite;
      setSaved((prev) =>
        prev.map((s) => (s.id === item.id ? { ...s, favorite } : s))
      );

      const res = await api(`/api/recipes/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ favorite }),
      });
      if (!res.ok) {
        setError("Could not save that change");
        loadSaved();
      }
    },
    [ensureSaved, loadSaved]
  );

  const startPlanning = useCallback(
    async (recipe: Recipe) => {
      const item = await ensureSaved(recipe);
      if (item) setPlanning(item);
    },
    [ensureSaved]
  );

  const set = <K extends keyof RecipeOptions>(key: K, value: RecipeOptions[K]) =>
    setOptions((prev) => (prev ? { ...prev, [key]: value } : prev));

  return (
    <div className="py-6 space-y-4">
      <div
        role="tablist"
        aria-label="Recipes view"
        className="grid grid-cols-2 gap-1 rounded-xl bg-muted/60 p-1"
      >
        <TabButton
          active={tab === "suggest"}
          onClick={() => setTab("suggest")}
          icon={<Sparkles className="h-4 w-4" />}
          label="Suggest"
        />
        <TabButton
          active={tab === "saved"}
          onClick={() => setTab("saved")}
          icon={<Bookmark className="h-4 w-4" />}
          label="Saved"
          count={saved.length}
        />
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-destructive/20 bg-destructive/10 px-3 py-2.5">
          <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
          <p className="text-sm text-destructive flex-1">{error}</p>
        </div>
      )}

      {tab === "suggest" ? (
        <>
          <div className="rounded-2xl border border-border bg-card p-4 space-y-4">
            {options ? (
              <>
                <Segmented
                  label="Meal"
                  options={MEAL_SLOTS.map((m) => ({ value: m, label: m }))}
                  value={options.meal}
                  onChange={(v) => set("meal", v)}
                  capitalize
                />
                <Segmented
                  label="Serves"
                  options={SERVINGS.map((n) => ({ value: n, label: String(n) }))}
                  value={options.servings}
                  onChange={(v) => set("servings", v)}
                />
                <Segmented
                  label="Missing ingredients allowed"
                  options={MISSING.map((n) => ({ value: n, label: String(n) }))}
                  value={options.allowedMissing}
                  onChange={(v) => set("allowedMissing", v)}
                />

                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">Diet</p>
                  <div className="flex flex-wrap gap-2">
                    {DIETS.map(({ key, label }) => {
                      const on = options[key] === true;
                      return (
                        <button
                          key={key}
                          role="switch"
                          aria-checked={on}
                          onClick={() => set(key, !on)}
                          className={cn(
                            "rounded-full px-3 py-1.5 text-xs font-medium border transition-colors",
                            on
                              ? "bg-primary text-primary-foreground border-primary"
                              : "border-border text-muted-foreground hover:text-foreground hover:bg-accent"
                          )}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <Link
                  href="/recipes/preferences"
                  className="flex items-center justify-between gap-2 rounded-xl border border-border px-3 py-2.5 text-sm hover:bg-accent transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
                    Taste and preferences
                  </span>
                  <span className="text-xs text-muted-foreground">
                    what the model is told about you
                  </span>
                </Link>

                {/* Saved and favourite recipes fill the list first unless this
                    is on, so a cook who wants something else can say so. */}
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={options.newOnly}
                    onChange={(e) => set("newOnly", e.target.checked)}
                    className="h-4 w-4 rounded border-border accent-primary"
                  />
                  <span className="text-sm">New only</span>
                  <span className="text-xs text-muted-foreground">
                    skip your saved recipes
                  </span>
                </label>
              </>
            ) : (
              <div className="h-40 rounded-xl bg-muted/40 animate-pulse" />
            )}

            <button
              onClick={generate}
              disabled={generating || !options}
              className={cn(
                "w-full flex items-center justify-center gap-2 rounded-2xl px-4 py-3.5",
                "font-medium transition-all duration-200",
                generating || !options
                  ? "bg-muted text-muted-foreground cursor-wait"
                  : "bg-primary text-primary-foreground shadow-md hover:shadow-lg active:scale-[0.99]"
              )}
            >
              {generating ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Working out what you can cook...
                </>
              ) : (
                <>
                  <ChefHat className="h-5 w-5" />
                  {suggestions ? "Suggest again" : "Suggest recipes"}
                </>
              )}
            </button>
          </div>

          {generating ? (
            <div className="space-y-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-24 rounded-2xl bg-muted/50 animate-pulse" />
              ))}
            </div>
          ) : suggestions === null ? (
            <p className="text-sm text-muted-foreground/60 text-center py-8 px-6">
              Set what you are after, then hit suggest.
            </p>
          ) : suggestions.length === 0 ? (
            <SparseState count={pantryCount ?? 0} />
          ) : (
            <ul className="space-y-3">
              {suggestions.map((r) => (
                <RecipeCard
                  key={r.title}
                  recipe={r}
                  saved={savedByTitle.get(r.title)}
                  expanded={open === r.title}
                  onToggle={() => setOpen(open === r.title ? null : r.title)}
                  onToggleSave={() => toggleSave(r)}
                  onToggleFavorite={() => toggleFavorite(r)}
                  onPlan={() => startPlanning(r)}
                />
              ))}
            </ul>
          )}
        </>
      ) : saved.length === 0 ? (
        <div className="text-center py-12 px-6">
          <Bookmark className="h-8 w-8 mx-auto mb-3 text-muted-foreground/25" />
          <p className="text-sm text-muted-foreground/70">Nothing saved yet.</p>
          <p className="text-xs text-muted-foreground/50 mt-1">
            Tap the bookmark on a suggestion to keep it.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {saved.map((r) => (
            <RecipeCard
              key={r.id}
              recipe={r}
              saved={r}
              expanded={open === r.title}
              onToggle={() => setOpen(open === r.title ? null : r.title)}
              onToggleSave={() => toggleSave(r)}
              onToggleFavorite={() => toggleFavorite(r)}
              onPlan={() => startPlanning(r)}
            />
          ))}
        </ul>
      )}

      {planning && (
        <PlanSheet
          recipe={planning}
          onClose={() => setPlanning(null)}
          onError={setError}
        />
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  count?: number;
}) {
  return (
    <button
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "flex items-center justify-center gap-2 rounded-lg px-3 py-2",
        "text-sm font-medium transition-all duration-150",
        active
          ? "bg-background text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground"
      )}
    >
      {icon}
      {label}
      {count !== undefined && (
        <span
          className={cn(
            "rounded-full px-1.5 py-0.5 text-[11px] tabular-nums leading-none",
            active ? "bg-primary/15 text-primary" : "bg-muted-foreground/15"
          )}
        >
          {count}
        </span>
      )}
    </button>
  );
}

function Segmented<T extends string | number>({
  label,
  options,
  value,
  onChange,
  capitalize,
}: {
  label: string;
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
  capitalize?: boolean;
}) {
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground mb-2">{label}</p>
      <div
        role="radiogroup"
        aria-label={label}
        className="flex gap-1 rounded-xl bg-muted/60 p-1"
      >
        {options.map((o) => (
          <button
            key={String(o.value)}
            role="radio"
            aria-checked={o.value === value}
            onClick={() => onChange(o.value)}
            className={cn(
              "flex-1 rounded-lg px-2 py-1.5 text-sm font-medium transition-all duration-150",
              capitalize && "capitalize",
              o.value === value
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function RecipeCard({
  recipe,
  saved,
  expanded,
  onToggle,
  onToggleSave,
  onToggleFavorite,
  onPlan,
}: {
  recipe: Recipe;
  saved?: SavedRecipe;
  expanded: boolean;
  onToggle: () => void;
  onToggleSave: () => void;
  onToggleFavorite: () => void;
  onPlan: () => void;
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
      {/* The rail stretches to the summary, not to the card: the expanded
          method renders as a sibling below this row, so opening a recipe
          leaves the three buttons exactly where the finger last found them. */}
      <div className="flex items-stretch">
        <button
          onClick={onToggle}
          aria-expanded={expanded}
          className="flex-1 min-w-0 text-left px-4 py-3.5 hover:bg-accent/40 transition-colors"
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
                    <Plus className="h-3.5 w-3.5" />
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

        {/* Three buttons, always three: starring or planning a suggestion
            keeps it first, so none of them has to disappear on an unsaved
            card and shuffle the other two. */}
        <div className="flex flex-col justify-between shrink-0 pr-2 py-3">
          <button
            onClick={onToggleSave}
            aria-label={saved ? `Unsave ${recipe.title}` : `Save ${recipe.title}`}
            title={saved ? "Saved" : "Save this recipe"}
            className={cn(
              "h-8 w-8 rounded-lg flex items-center justify-center transition-colors",
              saved
                ? "text-primary hover:bg-destructive/10 hover:text-destructive"
                : "text-muted-foreground/40 hover:text-primary hover:bg-primary/10"
            )}
          >
            <Bookmark className={cn("h-4 w-4", saved && "fill-current")} />
          </button>

          <button
            onClick={onToggleFavorite}
            aria-label={
              saved?.favorite
                ? `Remove ${recipe.title} from favourites`
                : `Mark ${recipe.title} a favourite`
            }
            title={saved?.favorite ? "Favourite" : "Mark as favourite"}
            className={cn(
              "h-8 w-8 rounded-lg flex items-center justify-center transition-colors",
              saved?.favorite
                ? "text-amber-500 hover:bg-amber-500/10"
                : "text-muted-foreground/40 hover:text-amber-500 hover:bg-amber-500/10"
            )}
          >
            <Star className={cn("h-4 w-4", saved?.favorite && "fill-current")} />
          </button>

          <button
            onClick={onPlan}
            aria-label={`Add ${recipe.title} to the meal plan`}
            title="Add to the meal plan"
            className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground/40 hover:text-primary hover:bg-primary/10 transition-colors"
          >
            <CalendarPlus className="h-4 w-4" />
          </button>
        </div>
      </div>

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

/**
 * Pick a day and a day part for one recipe.
 *
 * Shows what is already in each slot, because "dinner" being taken is the
 * thing you want to know before you overwrite it — the PUT upserts, so a
 * blind tap would quietly replace whatever was there.
 */
function PlanSheet({
  recipe,
  onClose,
  onError,
}: {
  recipe: SavedRecipe;
  onClose: () => void;
  onError: (message: string) => void;
}) {
  const [today] = useState(() => toLocalDateStr());
  const [date, setDate] = useState(today);
  const [day, setDay] = useState<DayPlan | null>(null);
  const [saving, setSaving] = useState<Meal | null>(null);
  const [done, setDone] = useState<Meal | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await api(`/api/plan?date=${date}`);
      if (cancelled || !res.ok) return;
      const data = await res.json();
      if (!cancelled) setDay(data.plan);
    })();
    return () => {
      cancelled = true;
    };
  }, [date]);

  /** Stepping the day blanks the slots here rather than in the effect above,
   *  so the fetch is the only thing the effect does. */
  const step = (days: number) => {
    setDay(null);
    setDone(null);
    setDate((d) => shiftDateStr(d, days));
  };

  const choose = async (meal: Meal) => {
    setSaving(meal);
    const res = await api("/api/plan", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date, meal, recipeId: recipe.id }),
    });
    setSaving(null);

    if (!res.ok) {
      onError("Could not add that to the plan");
      return;
    }
    setDay((prev) => (prev ? { ...prev, [meal]: recipe } : prev));
    setDone(meal);
    // Long enough to read the tick, short enough not to feel stuck.
    setTimeout(onClose, 700);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <button
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px] animate-in fade-in duration-150"
      />

      <div
        role="dialog"
        aria-label={`Add ${recipe.title} to the meal plan`}
        className="relative w-full max-w-2xl rounded-t-3xl border-t border-x border-border bg-background p-4 pb-8 space-y-4 animate-in slide-in-from-bottom duration-200"
      >
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-muted-foreground">Add to the plan</p>
            <h3 className="font-semibold leading-tight truncate">{recipe.title}</h3>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="h-8 w-8 shrink-0 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => step(-1)}
            aria-label="Previous day"
            className="h-9 w-9 shrink-0 rounded-xl border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="flex-1 text-center">
            <p className="text-sm font-medium">{dayLabel(date, today)}</p>
            <p className="text-xs text-muted-foreground tabular-nums">{date}</p>
          </div>
          <button
            onClick={() => step(1)}
            aria-label="Next day"
            className="h-9 w-9 shrink-0 rounded-xl border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <ul className="space-y-2">
          {MEAL_SLOTS.map((meal) => {
            const taken = day?.[meal] ?? null;
            const isThis = taken?.id === recipe.id;

            return (
              <li key={meal}>
                <button
                  onClick={() => choose(meal)}
                  disabled={saving !== null}
                  className={cn(
                    "w-full flex items-center gap-3 rounded-xl border px-3 py-3 text-left transition-colors",
                    done === meal
                      ? "border-emerald-500/40 bg-emerald-500/10"
                      : "border-border hover:bg-accent disabled:opacity-60"
                  )}
                >
                  <span className="w-20 shrink-0 text-sm font-medium capitalize">
                    {meal}
                  </span>
                  <span className="flex-1 min-w-0 truncate text-sm text-muted-foreground">
                    {day === null
                      ? "…"
                      : isThis
                        ? "already this one"
                        : (taken?.title ?? "None")}
                  </span>
                  {saving === meal ? (
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
                  ) : done === meal ? (
                    <Check className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  ) : (
                    <Plus className="h-4 w-4 shrink-0 text-muted-foreground/40" />
                  )}
                </button>
              </li>
            );
          })}
        </ul>

        <p className="text-center text-xs text-muted-foreground/60">
          A slot holds one dish. Picking replaces what is in it.
        </p>
      </div>
    </div>
  );
}

function SparseState({ count }: { count: number }) {
  return (
    <div className="text-center py-12 px-6">
      <ChefHat className="h-8 w-8 mx-auto mb-3 text-muted-foreground/25" />
      <p className="text-sm text-muted-foreground/70">
        {count < 3 ? "Not enough in the pantry yet." : "Nothing came back."}
      </p>
      <p className="text-xs text-muted-foreground/50 mt-1">
        {count < 3
          ? "Scan a receipt or say what is in your fridge, then come back."
          : "Try allowing more missing ingredients, or turning a diet filter off."}
      </p>
    </div>
  );
}
