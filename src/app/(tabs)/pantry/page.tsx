"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  Camera,
  Check,
  Loader2,
  Plus,
  ShoppingCart,
  Trash2,
  X,
} from "lucide-react";
import { api } from "@/lib/api";
import { downscaleImage } from "@/lib/image";
import { cn } from "@/lib/utils";
import type { PantryItem } from "@/types";

export default function PantryPage() {
  const [available, setAvailable] = useState<PantryItem[]>([]);
  const [needed, setNeeded] = useState<PantryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [newItem, setNewItem] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await api("/api/pantry");
      if (!res.ok) throw new Error("Could not load your pantry");
      const data = await res.json();
      setAvailable(data.available);
      setNeeded(data.needed);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load your pantry");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

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

        const cleared = data.clearedFromList as string[];
        setFlash(
          `Stocked ${data.stocked.length} item${data.stocked.length === 1 ? "" : "s"}` +
            (cleared.length
              ? ` · cleared ${cleared.join(", ")} from your list`
              : "")
        );
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
    async (item: PantryItem, status: "available" | "needed") => {
      // Optimistic: move it across immediately, roll back if the write fails.
      const moved = { ...item, status };
      if (status === "needed") {
        setAvailable((prev) => prev.filter((i) => i.id !== item.id));
        setNeeded((prev) => [...prev, moved].sort(byLabel));
      } else {
        setNeeded((prev) => prev.filter((i) => i.id !== item.id));
        setAvailable((prev) => [...prev, moved].sort(byLabel));
      }

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
      setAvailable((prev) => prev.filter((i) => i.id !== item.id));
      setNeeded((prev) => prev.filter((i) => i.id !== item.id));

      const res = await api(`/api/pantry/${item.id}`, { method: "DELETE" });
      if (!res.ok) {
        setError("Could not remove that item");
        load();
      }
    },
    [load]
  );

  const addManual = useCallback(async () => {
    const label = newItem.trim();
    if (!label) return;

    setNewItem("");
    const res = await api("/api/pantry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label, status: "needed" }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Could not add that item");
      return;
    }
    load();
  }, [newItem, load]);

  return (
    <div className="py-4 space-y-4">
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

      <button
        onClick={() => fileRef.current?.click()}
        disabled={scanning}
        className={cn(
          "w-full flex items-center justify-center gap-2 rounded-2xl px-4 py-4",
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

      {loading ? (
        <p className="text-sm text-muted-foreground py-8 text-center">
          Loading your pantry...
        </p>
      ) : (
        <>
          <Section
            title="Shopping list"
            icon={<ShoppingCart className="h-4 w-4" />}
            count={needed.length}
            empty="Nothing to buy. Say &ldquo;we ran out of milk&rdquo; and it lands here."
            accent="text-amber-600 dark:text-amber-400"
          >
            <div className="flex gap-2 pb-2">
              <input
                value={newItem}
                onChange={(e) => setNewItem(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addManual()}
                placeholder="Add something manually..."
                className={cn(
                  "flex-1 rounded-xl border border-border bg-background px-3 py-2",
                  "text-sm outline-none focus:border-primary/50"
                )}
              />
              <button
                onClick={addManual}
                disabled={!newItem.trim()}
                className={cn(
                  "h-9 w-9 shrink-0 rounded-xl flex items-center justify-center",
                  newItem.trim()
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground/40"
                )}
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>

            {needed.map((item) => (
              <Row
                key={item.id}
                item={item}
                actionIcon={<Check className="h-4 w-4" />}
                actionLabel="Mark as bought"
                onAction={() => setStatus(item, "available")}
                onRemove={() => remove(item)}
              />
            ))}
          </Section>

          <Section
            title="Available"
            icon={<Check className="h-4 w-4" />}
            count={available.length}
            empty="Scan a grocery receipt to fill this in."
            accent="text-emerald-600 dark:text-emerald-400"
          >
            {available.map((item) => (
              <Row
                key={item.id}
                item={item}
                actionIcon={<ShoppingCart className="h-4 w-4" />}
                actionLabel="Add to shopping list"
                onAction={() => setStatus(item, "needed")}
                onRemove={() => remove(item)}
              />
            ))}
          </Section>
        </>
      )}
    </div>
  );
}

function byLabel(a: PantryItem, b: PantryItem) {
  return a.label.localeCompare(b.label);
}

function Section({
  title,
  icon,
  count,
  empty,
  accent,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  count: number;
  empty: string;
  accent: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <h2 className={cn("flex items-center gap-2 text-sm font-semibold mb-3", accent)}>
        {icon}
        {title}
        <span className="ml-auto text-xs font-normal text-muted-foreground tabular-nums">
          {count}
        </span>
      </h2>
      <div className="space-y-1">
        {children}
        {count === 0 && (
          <p className="text-sm text-muted-foreground/60 py-3">{empty}</p>
        )}
      </div>
    </section>
  );
}

function Row({
  item,
  actionIcon,
  actionLabel,
  onAction,
  onRemove,
}: {
  item: PantryItem;
  actionIcon: React.ReactNode;
  actionLabel: string;
  onAction: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="group flex items-center gap-2 rounded-xl px-2 py-2 hover:bg-accent/50 transition-colors">
      <button
        onClick={onAction}
        title={actionLabel}
        aria-label={`${actionLabel}: ${item.label}`}
        className={cn(
          "h-7 w-7 shrink-0 rounded-lg flex items-center justify-center",
          "text-muted-foreground/50 hover:text-primary hover:bg-primary/10 transition-colors"
        )}
      >
        {actionIcon}
      </button>

      <span className="flex-1 text-sm truncate">{item.label}</span>

      {item.quantity && (
        <span className="text-xs text-muted-foreground tabular-nums shrink-0">
          {item.quantity}
        </span>
      )}

      <button
        onClick={onRemove}
        title="Remove"
        aria-label={`Remove ${item.label}`}
        className={cn(
          "h-7 w-7 shrink-0 rounded-lg flex items-center justify-center",
          "text-muted-foreground/30 hover:text-destructive hover:bg-destructive/10",
          "opacity-0 group-hover:opacity-100 focus:opacity-100 transition-all"
        )}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
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
        className="shrink-0 rounded-full p-0.5 opacity-50 hover:opacity-100 transition-opacity"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
