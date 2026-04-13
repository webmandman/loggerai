"use client";

import { useState, useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { SlidersHorizontal, X, Calendar } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CATEGORIES } from "@/types";
import { api } from "@/lib/api";

interface User {
  id: string;
  name: string | null;
  image: string | null;
}

interface FilterBarProps {
  selectedCategory: string | null;
  onCategoryChange: (category: string | null) => void;
  totalCount: number;
  dateFrom: string | null;
  dateTo: string | null;
  onDateRangeChange: (from: string | null, to: string | null) => void;
  selectedUser: string | null;
  onUserChange: (userId: string | null) => void;
}

export function FilterBar({
  selectedCategory,
  onCategoryChange,
  totalCount,
  dateFrom,
  dateTo,
  onDateRangeChange,
  selectedUser,
  onUserChange,
}: FilterBarProps) {
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const panelRef = useRef<HTMLDivElement>(null);

  const today = new Date().toISOString().split("T")[0];
  const isTodayActive = dateFrom === today && dateTo === today;

  const toggleToday = () => {
    if (isTodayActive) {
      onDateRangeChange(null, null);
    } else {
      onDateRangeChange(today, today);
    }
  };

  const activeCount =
    (selectedCategory ? 1 : 0) +
    (dateFrom || dateTo ? 1 : 0);

  useEffect(() => {
    api("/api/users")
      .then((res) => res.json())
      .then((data) => setUsers(data.users || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      const target = e.target as Node;
      if (
        panelRef.current &&
        !panelRef.current.contains(target) &&
        !(target instanceof Element && target.closest("[data-radix-popper-content-wrapper]"))
      ) {
        setOpen(false);
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  const handleClearAll = () => {
    onCategoryChange(null);
    onDateRangeChange(null, null);
    onUserChange(null);
  };

  // Sort users: current user first, then alphabetical
  const sortedUsers = [...users].sort((a, b) => {
    if (a.id === session?.user?.id) return -1;
    if (b.id === session?.user?.id) return 1;
    return (a.name || "").localeCompare(b.name || "");
  });

  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <div className="relative">
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 text-sm"
            onClick={() => setOpen(!open)}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Filters
            {activeCount > 0 && (
              <Badge
                variant="secondary"
                className="ml-1 h-5 min-w-5 px-1 text-xs rounded-full"
              >
                {activeCount}
              </Badge>
            )}
          </Button>

          {open && (
            <div
              ref={panelRef}
              className="absolute left-0 top-full mt-2 z-50 w-72 rounded-lg border bg-popover p-4 shadow-lg space-y-4 overflow-hidden"
            >
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">
                  Category
                </label>
                <Select
                  value={selectedCategory || "all"}
                  onValueChange={(v) => onCategoryChange(v === "all" ? null : v)}
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder="All categories" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All categories</SelectItem>
                    {CATEGORIES.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {cat.charAt(0).toUpperCase() + cat.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  Date range
                </label>
                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                  <input
                    type="date"
                    value={dateFrom || ""}
                    onChange={(e) =>
                      onDateRangeChange(e.target.value || null, dateTo)
                    }
                    className="h-8 w-full min-w-0 rounded-md border border-border bg-transparent px-2 text-xs text-foreground outline-none focus:ring-1 focus:ring-ring"
                    aria-label="From date"
                  />
                  <span className="text-xs text-muted-foreground">to</span>
                  <input
                    type="date"
                    value={dateTo || ""}
                    onChange={(e) =>
                      onDateRangeChange(dateFrom, e.target.value || null)
                    }
                    className="h-8 w-full min-w-0 rounded-md border border-border bg-transparent px-2 text-xs text-foreground outline-none focus:ring-1 focus:ring-ring"
                    aria-label="To date"
                  />
                </div>
              </div>

              {activeCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full h-7 text-xs"
                  onClick={handleClearAll}
                >
                  <X className="h-3 w-3 mr-1" />
                  Clear all filters
                </Button>
              )}
            </div>
          )}
        </div>

        <Button
          variant={isTodayActive ? "default" : "outline"}
          size="sm"
          className="h-8 text-sm"
          onClick={toggleToday}
        >
          Today
        </Button>

        <div className="flex items-center gap-1">
          {sortedUsers.map((u) => (
            <button
              key={u.id}
              onClick={() => onUserChange(selectedUser === u.id ? null : u.id)}
              className={`h-8 w-8 rounded-full overflow-hidden transition-all ${
                selectedUser === u.id
                  ? "ring-2 ring-primary ring-offset-2 ring-offset-background"
                  : "opacity-50 hover:opacity-100"
              }`}
              title={u.name || "Unknown"}
            >
              {u.image ? (
                <img
                  src={u.image}
                  alt=""
                  className="h-full w-full object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="h-full w-full bg-muted flex items-center justify-center text-xs font-medium">
                  {u.name?.charAt(0) || "?"}
                </div>
              )}
            </button>
          ))}
        </div>
      </div>

    </div>
  );
}
