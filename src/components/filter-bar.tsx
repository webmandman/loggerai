"use client";

import { X, Calendar } from "lucide-react";
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

interface FilterBarProps {
  selectedCategory: string | null;
  onCategoryChange: (category: string | null) => void;
  totalCount: number;
  dateFrom: string | null;
  dateTo: string | null;
  onDateRangeChange: (from: string | null, to: string | null) => void;
}

export function FilterBar({
  selectedCategory,
  onCategoryChange,
  totalCount,
  dateFrom,
  dateTo,
  onDateRangeChange,
}: FilterBarProps) {
  const hasDateFilter = dateFrom || dateTo;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Select
            value={selectedCategory || "all"}
            onValueChange={(value) =>
              onCategoryChange(value === "all" ? null : value)
            }
          >
            <SelectTrigger className="w-[160px] h-8 text-sm">
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
          {selectedCategory && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2"
              onClick={() => onCategoryChange(null)}
            >
              <X className="h-3 w-3 mr-1" />
              Clear
            </Button>
          )}
        </div>
        <span className="text-sm text-muted-foreground">
          {totalCount} {totalCount === 1 ? "entry" : "entries"}
        </span>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <Calendar className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <input
          type="date"
          value={dateFrom || ""}
          onChange={(e) => onDateRangeChange(e.target.value || null, dateTo)}
          className="h-7 rounded-md border border-border bg-transparent px-2 text-xs text-foreground outline-none focus:ring-1 focus:ring-ring"
          aria-label="From date"
        />
        <span className="text-xs text-muted-foreground">to</span>
        <input
          type="date"
          value={dateTo || ""}
          onChange={(e) => onDateRangeChange(dateFrom, e.target.value || null)}
          className="h-7 rounded-md border border-border bg-transparent px-2 text-xs text-foreground outline-none focus:ring-1 focus:ring-ring"
          aria-label="To date"
        />
        {hasDateFilter && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => onDateRangeChange(null, null)}
          >
            <X className="h-3 w-3 mr-1" />
            Clear dates
          </Button>
        )}
      </div>
    </div>
  );
}
