"use client";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface MonthNavProps {
  month: Date;
  onChange: (d: Date) => void;
  size?: "sm" | "md";
}

export function MonthNav({ month, onChange, size = "md" }: MonthNavProps) {
  const year = month.getFullYear();
  const m = month.getMonth();
  const label = month.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const iconSize = size === "sm" ? 13 : 16;
  return (
    <div className="flex items-center justify-between">
      <button
        onClick={() => onChange(new Date(year, m - 1, 1))}
        className="p-1.5 text-(--color-text-tertiary) hover:text-(--color-text-primary) transition-colors"
      >
        <ChevronLeft size={iconSize} />
      </button>
      <p className={`font-medium text-(--color-text-secondary) ${size === "sm" ? "text-[11px]" : "text-sm"}`}>{label}</p>
      <button
        onClick={() => onChange(new Date(year, m + 1, 1))}
        className="p-1.5 text-(--color-text-tertiary) hover:text-(--color-text-primary) transition-colors"
      >
        <ChevronRight size={iconSize} />
      </button>
    </div>
  );
}
