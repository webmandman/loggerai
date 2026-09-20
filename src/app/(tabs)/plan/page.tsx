"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  CalendarDays,
  ChefHat,
  ChevronLeft,
  ChevronRight,
  Clock,
  Loader2,
  Users,
  X,
} from "lucide-react";
import { api } from "@/lib/api";
import { cn, toLocalDateStr } from "@/lib/utils";
import { dayLabel, MEAL_SLOTS, shiftDateStr } from "@/lib/plan";
import { swipeIntent, SWIPE_MAX, swipeOffset, SWIPE_THRESHOLD } from "@/lib/swipe";
import type { DayPlan, Meal, SavedRecipe } from "@/types";

const EMPTY: DayPlan = { breakfast: null, lunch: null, dinner: null };

export default function PlanPage() {
  // Null until mounted: the day this page opens on reads the clock, and the
  // route is prerendered, so picking it during SSR would pin every visitor to
  // whatever day the build machine was having.
  const [today, setToday] = useState<string | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [plan, setPlan] = useState<DayPlan>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const key = toLocalDateStr();
    setToday(key);
    setDate(key);
  }, []);

  const load = useCallback(async (key: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api(`/api/plan?date=${key}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not load that day");
      setPlan(data.plan);
    } catch (err) {
      setPlan(EMPTY);
      setError(err instanceof Error ? err.message : "Could not load that day");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (date) load(date);
  }, [date, load]);

  const go = useCallback((days: number) => {
    setDate((prev) => (prev ? shiftDateStr(prev, days) : prev));
  }, []);

  const clear = useCallback(
    async (meal: Meal) => {
      if (!date) return;
      const previous = plan[meal];
      setPlan((p) => ({ ...p, [meal]: null }));

      const res = await api(`/api/plan?date=${date}&meal=${meal}`, { method: "DELETE" });
      if (!res.ok) {
        setError("Could not clear that meal");
        setPlan((p) => ({ ...p, [meal]: previous }));
      }
    },
    [date, plan]
  );

  // Arrow keys move the day too: a keyboard user cannot swipe, and the two
  // buttons alone mean tabbing back and forth for every single step.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA)$/.test(target.tagName)) return;
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go]);

  return (
    <div className="py-6 space-y-4">
      <DayBar
        label={date && today ? dayLabel(date, today) : ""}
        subLabel={date ?? ""}
        isToday={!!date && date === today}
        onPrev={() => go(-1)}
        onNext={() => go(1)}
        onToday={() => setDate(today)}
      />

      {error && (
        <div className="rounded-xl border border-destructive/20 bg-destructive/10 px-3 py-2.5">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      <SwipeDays onPrev={() => go(-1)} onNext={() => go(1)}>
        <ul className="space-y-3">
          {MEAL_SLOTS.map((meal) => (
            <MealSlot
              key={meal}
              meal={meal}
              recipe={plan[meal]}
              loading={loading}
              onClear={() => clear(meal)}
            />
          ))}
        </ul>
      </SwipeDays>

      <p className="text-center text-xs text-muted-foreground/50 px-6">
        Swipe left or right to change the day. Fill a slot from the calendar
        button on any recipe.
      </p>
    </div>
  );
}

function DayBar({
  label,
  subLabel,
  isToday,
  onPrev,
  onNext,
  onToday,
}: {
  label: string;
  subLabel: string;
  isToday: boolean;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <ArrowButton label="Previous day" onClick={onPrev}>
        <ChevronLeft className="h-5 w-5" />
      </ArrowButton>

      <div className="flex-1 min-w-0 text-center">
        <p className="font-semibold leading-tight truncate">{label || " "}</p>
        <button
          onClick={onToday}
          disabled={isToday}
          className={cn(
            "text-xs tabular-nums transition-colors",
            isToday
              ? "text-muted-foreground/60 cursor-default"
              : "text-primary hover:underline"
          )}
        >
          {isToday ? subLabel : `${subLabel} · back to today`}
        </button>
      </div>

      <ArrowButton label="Next day" onClick={onNext}>
        <ChevronRight className="h-5 w-5" />
      </ArrowButton>
    </div>
  );
}

function ArrowButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="h-10 w-10 shrink-0 rounded-xl border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors active:scale-95"
    >
      {children}
    </button>
  );
}

/**
 * Drag the day sideways to change day.
 *
 * Same classifier the pantry rows use, so a diagonal flick scrolls the page
 * instead of being eaten here. Mouse is left out on purpose: the arrows are
 * right there, and a mouse drag fights text selection.
 */
function SwipeDays({
  onPrev,
  onNext,
  children,
}: {
  onPrev: () => void;
  onNext: () => void;
  children: React.ReactNode;
}) {
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const gesture = useRef<{
    x: number;
    y: number;
    live: boolean;
    horizontal: boolean;
  } | null>(null);

  const down = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse") return;
    gesture.current = { x: e.clientX, y: e.clientY, live: true, horizontal: false };
  };

  const move = (e: React.PointerEvent) => {
    const g = gesture.current;
    if (!g?.live) return;

    const deltaX = e.clientX - g.x;
    const deltaY = e.clientY - g.y;

    if (!g.horizontal) {
      const intent = swipeIntent(deltaX, deltaY);
      if (intent === "pending") return;
      if (intent === "scroll") {
        g.live = false; // let the page scroll; stay out of the way
        return;
      }
      g.horizontal = true;
      setDragging(true);
      e.currentTarget.setPointerCapture(e.pointerId);
    }

    setDx(swipeOffset(deltaX));
  };

  const end = () => {
    const g = gesture.current;
    gesture.current = null;
    setDragging(false);
    setDx(0);
    if (!g?.horizontal) return;

    // Dragging right pulls yesterday in from the left, the direction every
    // calendar and photo roll already uses.
    if (dx >= SWIPE_THRESHOLD) onPrev();
    else if (dx <= -SWIPE_THRESHOLD) onNext();
  };

  return (
    <div
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
      style={{
        touchAction: "pan-y",
        transform: `translateX(${dx}px)`,
        opacity: 1 - Math.min(0.35, Math.abs(dx) / (SWIPE_MAX * 3)),
        transition: dragging
          ? "none"
          : "transform 180ms ease-out, opacity 180ms ease-out",
      }}
    >
      {children}
    </div>
  );
}

function MealSlot({
  meal,
  recipe,
  loading,
  onClear,
}: {
  meal: Meal;
  recipe: SavedRecipe | null;
  loading: boolean;
  onClear: () => void;
}) {
  return (
    <li className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between px-4 pt-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {meal}
        </p>
        {recipe && (
          <button
            onClick={onClear}
            aria-label={`Clear ${meal}`}
            title={`Clear ${meal}`}
            className="h-7 w-7 rounded-lg flex items-center justify-center text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="px-4 pb-4 pt-2">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground/60">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading
          </div>
        ) : !recipe ? (
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground/60">None</p>
            <Link
              href="/recipes"
              className="flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
            >
              <ChefHat className="h-3.5 w-3.5" />
              Pick one
            </Link>
          </div>
        ) : (
          <>
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
              <span className="flex items-center gap-1">
                <CalendarDays className="h-3.5 w-3.5" />
                {recipe.ingredients.length} ingredients
              </span>
            </div>
          </>
        )}
      </div>
    </li>
  );
}
