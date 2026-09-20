"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  Camera,
  Check,
  Circle,
  Loader2,
  Merge,
  Plus,
  Search,
  ShoppingCart,
  Trash2,
  X,
} from "lucide-react";
import { api, writeSeq } from "@/lib/api";
import { isStale } from "@/lib/live";
import { reportAction, setActivity } from "@/lib/presence";
import { useLive } from "@/lib/use-live";
import { downscaleImage } from "@/lib/image";
import {
  SWIPE_MAX,
  shouldDelete,
  shouldMerge,
  swipeIntent,
  swipeOffset,
} from "@/lib/swipe";
import { cn } from "@/lib/utils";
import type { PantryItem } from "@/types";

type Tab = "needed" | "available";

/** Above this many rows, scrolling stops being a reasonable way to find things. */
const SEARCH_THRESHOLD = 8;

export default function PantryPage() {
  const [items, setItems] = useState<PantryItem[]>([]);
  const [tab, setTab] = useState<Tab>("needed");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [undo, setUndo] = useState<PantryItem | null>(null);
  const [mergeFrom, setMergeFrom] = useState<PantryItem | null>(null);
  const [newItem, setNewItem] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async (background = false) => {
    const seq = writeSeq();
    try {
      const res = await api("/api/pantry");
      if (!res.ok) throw new Error("Could not load your pantry");
      const data = await res.json();
      // A write started while this read was out, so it knows something this
      // response does not. Applying it would put a just-deleted row back.
      if (background && isStale(seq, writeSeq())) return;
      setItems([...data.needed, ...data.available]);
    } catch (err) {
      // Background failures stay silent: this app gets used in a shop, where
      // signal drops constantly, and an error banner over the list every time
      // it does is worse than showing slightly older items.
      if (background) return;
      setError(err instanceof Error ? err.message : "Could not load your pantry");
    } finally {
      if (!background) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Someone else is usually holding the other half of this list — a partner at
  // home auditing shelves while you are at the shop. Merging is paused because
  // it is a two-tap gesture with a half-finished selection on screen.
  useLive(load, mergeFrom !== null);

  const needed = useMemo(() => items.filter((i) => i.status === "needed"), [items]);
  const available = useMemo(
    () => items.filter((i) => i.status === "available"),
    [items]
  );

  // While merging, show every item regardless of tab: the duplicate you are
  // folding together is usually split across the two lists, which is exactly
  // how it went unnoticed.
  const active = useMemo(
    () =>
      mergeFrom
        ? items.filter((i) => i.id !== mergeFrom.id)
        : tab === "needed"
          ? needed
          : available,
    [mergeFrom, items, tab, needed, available]
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = q
      ? active.filter(
          (i) =>
            i.label.toLowerCase().includes(q) ||
            i.name.includes(q) ||
            // Searching "creamer" should find the row labelled "Half & Half".
            i.aliases?.some((a) => a.includes(q))
        )
      : active;
    return [...rows].sort((a, b) => a.label.localeCompare(b.label));
  }, [active, query]);

  const handleScan = useCallback(
    async (file: File) => {
      setError(null);
      setFlash(null);
      setScanning(true);
      // Long enough that someone else will see the note and know not to add
      // the same shopping to the list twice.
      setActivity("scanning a receipt");

      try {
        const formData = new FormData();
        formData.append("image", await downscaleImage(file));

        const res = await api("/api/receipt", { method: "POST", body: formData });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Receipt scan failed");

        const cleared: string[] = data.clearedFromList ?? [];
        reportAction(
          `stocked ${data.stocked.length} item${data.stocked.length === 1 ? "" : "s"} from a receipt`
        );
        setFlash(
          `Stocked ${data.stocked.length} item${data.stocked.length === 1 ? "" : "s"}` +
            (cleared.length ? ` · cleared ${cleared.join(", ")} off your list` : "")
        );
        setTab("available");
        await load();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Receipt scan failed");
      } finally {
        setScanning(false);
        setActivity(null);
      }
    },
    [load]
  );

  const setStatus = useCallback(
    async (item: PantryItem, status: Tab) => {
      setItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, status } : i))
      );

      const res = await api(`/api/pantry/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });

      if (!res.ok) {
        setError("Could not save that change");
        load();
        return;
      }

      // Announced only once it has actually landed: telling the house someone
      // bought milk and then failing the write would be worse than silence.
      reportAction(
        status === "available"
          ? `got ${item.label}`
          : `put ${item.label} back on the list`
      );
    },
    [load]
  );

  const remove = useCallback(
    async (item: PantryItem) => {
      setItems((prev) => prev.filter((i) => i.id !== item.id));
      setFlash(null);
      setError(null);
      // A swipe is easy to trigger by accident, so deletion needs a way back.
      setUndo(item);

      const res = await api(`/api/pantry/${item.id}`, { method: "DELETE" });
      if (!res.ok) {
        setUndo(null);
        setError("Could not remove that item");
        load();
        return;
      }
      reportAction(`removed ${item.label}`);
    },
    [load]
  );

  const doMerge = useCallback(
    async (into: PantryItem) => {
      const from = mergeFrom;
      if (!from || from.id === into.id) {
        setMergeFrom(null);
        return;
      }
      setMergeFrom(null);
      setUndo(null);

      const res = await api("/api/pantry/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromId: from.id, intoId: into.id }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Could not merge those items");
        return;
      }

      const data = await res.json();
      setFlash(`Merged ${data.merged} into ${data.into}`);
      load();
    },
    [mergeFrom, load]
  );

  const undoRemove = useCallback(async () => {
    if (!undo) return;
    const item = undo;
    setUndo(null);

    // Re-create rather than soft-delete: the row is sent back whole, so it
    // survives navigating away before undoing.
    const res = await api("/api/pantry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: item.name,
        label: item.label,
        status: item.status,
        quantity: item.quantity,
        aliases: item.aliases,
      }),
    });

    if (!res.ok) {
      setError(`Could not restore ${item.label}`);
      return;
    }
    load();
  }, [undo, load]);

  const addManual = useCallback(async () => {
    const label = newItem.trim();
    if (!label) return;

    setNewItem("");
    const res = await api("/api/pantry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label, status: tab }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Could not add that item");
      return;
    }
    reportAction(
      tab === "needed" ? `added ${label} to the list` : `stocked ${label}`
    );
    load();
  }, [newItem, tab, load]);

  const showSearch = active.length > SEARCH_THRESHOLD;

  return (
    <div className="pb-4">
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = ""; // allow re-picking the same photo
          if (file) handleScan(file);
        }}
      />

      {/* Pinned under the app header so a long list never scrolls the controls
          — or the other tab's count — out of reach. */}
      <div className="sticky top-[57px] z-40 -mx-4 px-4 pt-4 pb-3 bg-background/95 backdrop-blur-md border-b border-border/40 space-y-3">
        <button
          onClick={() => fileRef.current?.click()}
          disabled={scanning}
          className={cn(
            "w-full flex items-center justify-center gap-2 rounded-2xl px-4 py-3.5",
            "font-medium transition-all duration-200",
            scanning
              ? "bg-muted text-muted-foreground cursor-wait"
              : "bg-primary text-primary-foreground shadow-md hover:shadow-lg active:scale-[0.99]"
          )}
        >
          {scanning ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              Reading your receipt...
            </>
          ) : (
            <>
              <Camera className="h-5 w-5" />
              Scan a receipt
            </>
          )}
        </button>

        <div
          role="tablist"
          aria-label="Pantry view"
          className="grid grid-cols-2 gap-1 rounded-xl bg-muted/60 p-1"
        >
          <TabButton
            active={tab === "needed"}
            onClick={() => {
              setTab("needed");
              setQuery("");
            }}
            icon={<ShoppingCart className="h-4 w-4" />}
            label="To buy"
            count={needed.length}
          />
          <TabButton
            active={tab === "available"}
            onClick={() => {
              setTab("available");
              setQuery("");
            }}
            icon={<Check className="h-4 w-4" />}
            label="In stock"
            count={available.length}
          />
        </div>

        {showSearch && (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${active.length} items...`}
              className={cn(
                "w-full rounded-xl border border-border bg-background",
                "pl-9 pr-9 py-2 text-sm outline-none focus:border-primary/50"
              )}
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground/50 hover:text-foreground hover:bg-accent"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )}
      </div>

      <div className="pt-3 space-y-2">
        {mergeFrom && (
          <div
            className={cn(
              "flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-3 py-2.5",
              "animate-in fade-in slide-in-from-top-1 duration-200"
            )}
          >
            <Merge className="h-4 w-4 text-primary shrink-0" />
            <p className="text-sm flex-1 min-w-0">
              Tap the item to merge{" "}
              <span className="font-medium">{mergeFrom.label}</span> into
            </p>
            <button
              onClick={() => setMergeFrom(null)}
              aria-label="Cancel merge"
              className="shrink-0 rounded-full p-0.5 opacity-60 hover:opacity-100 transition-opacity"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {undo && (
          <div
            className={cn(
              "flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2.5",
              "animate-in fade-in slide-in-from-top-1 duration-200"
            )}
          >
            <Trash2 className="h-4 w-4 text-muted-foreground shrink-0" />
            <p className="text-sm flex-1 min-w-0 truncate">
              Removed <span className="font-medium">{undo.label}</span>
            </p>
            <button
              onClick={undoRemove}
              className="shrink-0 rounded-lg px-2.5 py-1 text-sm font-medium text-primary hover:bg-primary/10 transition-colors"
            >
              Undo
            </button>
            <button
              onClick={() => setUndo(null)}
              aria-label="Dismiss"
              className="shrink-0 rounded-full p-0.5 opacity-50 hover:opacity-100 transition-opacity"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {flash && (
          <Banner tone="ok" onDismiss={() => setFlash(null)}>
            {flash}
          </Banner>
        )}
        {error && (
          <Banner tone="error" onDismiss={() => setError(null)}>
            {error}
          </Banner>
        )}

        <div className="flex gap-2">
          <input
            value={newItem}
            onChange={(e) => setNewItem(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addManual()}
            placeholder={
              tab === "needed" ? "Add something to buy..." : "Add something you have..."
            }
            className={cn(
              "flex-1 rounded-xl border border-dashed border-border bg-transparent",
              "px-3 py-2 text-sm outline-none focus:border-primary/50 focus:border-solid"
            )}
          />
          <button
            onClick={addManual}
            disabled={!newItem.trim()}
            aria-label="Add item"
            className={cn(
              "h-9 w-9 shrink-0 rounded-xl flex items-center justify-center transition-colors",
              newItem.trim()
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground/40"
            )}
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>

        {loading ? (
          <div className="space-y-2 pt-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-11 rounded-xl bg-muted/50 animate-pulse" />
            ))}
          </div>
        ) : visible.length === 0 ? (
          <EmptyState tab={tab} searching={query.trim().length > 0} />
        ) : (
          <ul className="pt-1">
            {visible.map((item) => (
              <Row
                key={item.id}
                item={item}
                merging={mergeFrom !== null}
                onToggle={() =>
                  setStatus(item, item.status === "needed" ? "available" : "needed")
                }
                onRemove={() => remove(item)}
                onStartMerge={() => setMergeFrom(item)}
                onPickMergeTarget={() => doMerge(item)}
              />
            ))}
          </ul>
        )}
      </div>
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
  count: number;
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
      <span
        className={cn(
          "rounded-full px-1.5 py-0.5 text-[11px] tabular-nums leading-none",
          active ? "bg-primary/15 text-primary" : "bg-muted-foreground/15"
        )}
      >
        {count}
      </span>
    </button>
  );
}

function Row({
  item,
  merging,
  onToggle,
  onRemove,
  onStartMerge,
  onPickMergeTarget,
}: {
  item: PantryItem;
  merging: boolean;
  onToggle: () => void;
  onRemove: () => void;
  onStartMerge: () => void;
  onPickMergeTarget: () => void;
}) {
  const buying = item.status === "needed";
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const gesture = useRef<{
    x: number;
    y: number;
    live: boolean;
    horizontal: boolean;
  } | null>(null);

  const handlePointerDown = (e: React.PointerEvent) => {
    // Desktop keeps the hover buttons; swiping with a mouse fights text
    // selection and drag-to-scroll for no benefit. While merging, the whole
    // row is a target, so gestures would only get in the way.
    if (e.pointerType === "mouse" || merging) return;
    gesture.current = { x: e.clientX, y: e.clientY, live: true, horizontal: false };
  };

  const handlePointerMove = (e: React.PointerEvent) => {
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

  const handlePointerEnd = () => {
    const g = gesture.current;
    gesture.current = null;
    setDragging(false);

    if (!g?.horizontal) {
      setDx(0);
      return;
    }

    if (shouldDelete(dx)) {
      setDx(-SWIPE_MAX * 3); // slide it off before the parent unmounts it
      onRemove();
      return;
    }

    setDx(0);
    if (shouldMerge(dx)) onStartMerge();
  };

  return (
    <li
      className="relative overflow-hidden rounded-xl"
      style={{ touchAction: "pan-y" }}
    >
      <div
        aria-hidden
        className={cn(
          "absolute inset-0 flex items-center rounded-xl text-white transition-opacity",
          dx < 0 && "justify-end pr-5 bg-destructive",
          dx > 0 && "justify-start pl-5 bg-primary",
          dx === 0 && "opacity-0"
        )}
      >
        {dx < 0 ? (
          <Trash2
            className={cn(
              "h-5 w-5 transition-transform",
              shouldDelete(dx) ? "scale-110" : "scale-90"
            )}
          />
        ) : (
          <Merge
            className={cn(
              "h-5 w-5 transition-transform",
              shouldMerge(dx) ? "scale-110" : "scale-90"
            )}
          />
        )}
      </div>

      <div
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        style={{
          transform: `translateX(${dx}px)`,
          transition: dragging ? "none" : "transform 180ms ease-out",
        }}
        onClick={merging ? onPickMergeTarget : undefined}
        role={merging ? "button" : undefined}
        aria-label={merging ? `Merge into ${item.label}` : undefined}
        className={cn(
          "group relative flex items-center gap-3 rounded-xl bg-background px-1 py-1",
          merging
            ? "cursor-pointer ring-1 ring-transparent hover:ring-primary/40 hover:bg-primary/5"
            : "hover:bg-accent/40"
        )}
      >
      <button
        disabled={merging}
        onClick={onToggle}
        aria-label={
          buying ? `Mark ${item.label} as bought` : `Add ${item.label} to shopping list`
        }
        title={buying ? "Bought it" : "Add to shopping list"}
        className={cn(
          "h-10 w-10 shrink-0 rounded-xl flex items-center justify-center transition-colors",
          buying
            ? "text-muted-foreground/40 hover:text-emerald-500 hover:bg-emerald-500/10"
            : "text-muted-foreground/40 hover:text-amber-500 hover:bg-amber-500/10"
        )}
      >
        {buying ? (
          <span className="relative flex items-center justify-center">
            <Circle className="h-5 w-5" />
            <Check className="absolute h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
          </span>
        ) : (
          <ShoppingCart className="h-[18px] w-[18px]" />
        )}
      </button>

      <span className="flex-1 min-w-0 text-[15px] truncate">{item.label}</span>

      {/* While merging the list spans both tabs, so say which side each is on. */}
      {merging && (
        <span
          className={cn(
            "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium",
            buying
              ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
              : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
          )}
        >
          {buying ? "to buy" : "in stock"}
        </span>
      )}

      {item.quantity && !merging && (
        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
          {item.quantity}
        </span>
      )}

      <button
        onClick={onStartMerge}
        disabled={merging}
        aria-label={`Merge ${item.label} into another item`}
        title="Merge into another item"
        className={cn(
          "h-9 w-9 shrink-0 rounded-lg items-center justify-center",
          "text-muted-foreground/40 hover:text-primary hover:bg-primary/10",
          // Desktop-only: on touch this is the swipe-right gesture, and two
          // affordances per row would crowd out the label.
          "hidden sm:flex sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100 transition-all"
        )}
      >
        <Merge className="h-4 w-4" />
      </button>

      <button
        onClick={onRemove}
        disabled={merging}
        aria-label={`Remove ${item.label}`}
        title="Remove"
        className={cn(
          "h-9 w-9 shrink-0 rounded-lg flex items-center justify-center",
          "text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10",
          // Visible by default: touch devices have no hover, so the old
          // hover-only reveal meant no way to delete at all on a phone.
          // Desktop keeps the quieter reveal-on-hover behaviour.
          "opacity-100 transition-all",
          "sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
        )}
      >
        <Trash2 className="h-4 w-4" />
      </button>
      </div>
    </li>
  );
}

function EmptyState({ tab, searching }: { tab: Tab; searching: boolean }) {
  if (searching) {
    return (
      <p className="text-sm text-muted-foreground/60 text-center py-10">
        Nothing matches that.
      </p>
    );
  }

  return (
    <div className="text-center py-10 px-6">
      {tab === "needed" ? (
        <>
          <ShoppingCart className="h-8 w-8 mx-auto mb-3 text-muted-foreground/25" />
          <p className="text-sm text-muted-foreground/70">Nothing to buy.</p>
          <p className="text-xs text-muted-foreground/50 mt-1">
            Say &ldquo;we ran out of milk&rdquo; and it shows up here.
          </p>
        </>
      ) : (
        <>
          <Camera className="h-8 w-8 mx-auto mb-3 text-muted-foreground/25" />
          <p className="text-sm text-muted-foreground/70">Nothing stocked yet.</p>
          <p className="text-xs text-muted-foreground/50 mt-1">
            Scan a grocery receipt to fill this in.
          </p>
        </>
      )}
    </div>
  );
}

function Banner({
  tone,
  onDismiss,
  children,
}: {
  tone: "ok" | "error";
  onDismiss: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-xl border px-3 py-2.5",
        "animate-in fade-in slide-in-from-top-1 duration-200",
        tone === "ok"
          ? "bg-emerald-500/10 border-emerald-500/20"
          : "bg-destructive/10 border-destructive/20"
      )}
    >
      {tone === "ok" ? (
        <Check className="h-4 w-4 text-emerald-500 shrink-0" />
      ) : (
        <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
      )}
      <p
        className={cn(
          "text-sm flex-1",
          tone === "ok" ? "text-emerald-700 dark:text-emerald-300" : "text-destructive"
        )}
      >
        {children}
      </p>
      <button
        onClick={onDismiss}
        aria-label="Dismiss"
        className="shrink-0 rounded-full p-0.5 opacity-50 hover:opacity-100 transition-opacity"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
