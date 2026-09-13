"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  Camera,
  Check,
  Circle,
  Loader2,
  Plus,
  Search,
  ShoppingCart,
  Trash2,
  X,
} from "lucide-react";
import { api } from "@/lib/api";
import { downscaleImage } from "@/lib/image";
import {
  SWIPE_MAX,
  SWIPE_THRESHOLD,
  shouldDelete,
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
  const [newItem, setNewItem] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await api("/api/pantry");
      if (!res.ok) throw new Error("Could not load your pantry");
      const data = await res.json();
      setItems([...data.needed, ...data.available]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load your pantry");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const needed = useMemo(() => items.filter((i) => i.status === "needed"), [items]);
  const available = useMemo(
    () => items.filter((i) => i.status === "available"),
    [items]
  );

  const active = tab === "needed" ? needed : available;

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

      try {
        const formData = new FormData();
        formData.append("image", await downscaleImage(file));

        const res = await api("/api/receipt", { method: "POST", body: formData });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Receipt scan failed");

        const cleared: string[] = data.clearedFromList ?? [];
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
      }
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
      }
    },
    [load]
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
                tab={tab}
                onToggle={() =>
                  setStatus(item, tab === "needed" ? "available" : "needed")
                }
                onRemove={() => remove(item)}
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
  tab,
  onToggle,
  onRemove,
}: {
  item: PantryItem;
  tab: Tab;
  onToggle: () => void;
  onRemove: () => void;
}) {
  const buying = tab === "needed";
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const gesture = useRef<{
    x: number;
    y: number;
    live: boolean;
    horizontal: boolean;
  } | null>(null);

  const handlePointerDown = (e: React.PointerEvent) => {
    // Desktop keeps the hover trash button; swiping with a mouse fights
    // text selection and drag-to-scroll for no benefit.
    if (e.pointerType === "mouse") return;
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
    } else {
      setDx(0);
    }
  };

  return (
    <li
      className="relative overflow-hidden rounded-xl"
      style={{ touchAction: "pan-y" }}
    >
      <div
        aria-hidden
        className={cn(
          "absolute inset-0 flex items-center justify-end pr-5 rounded-xl",
          "bg-destructive text-white transition-opacity",
          dx < 0 ? "opacity-100" : "opacity-0"
        )}
      >
        <Trash2
          className={cn(
            "h-5 w-5 transition-transform",
            dx <= -SWIPE_THRESHOLD ? "scale-110" : "scale-90"
          )}
        />
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
        className="group relative flex items-center gap-3 rounded-xl bg-background px-1 py-1 hover:bg-accent/40"
      >
      <button
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

      {item.quantity && (
        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
          {item.quantity}
        </span>
      )}

      <button
        onClick={onRemove}
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
