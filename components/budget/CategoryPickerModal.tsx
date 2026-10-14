"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { CATEGORY_META } from "./types";

interface Props {
  transactionId: string;
  currentCategory: string | undefined;
  onSelect: (transactionId: string, category: string) => void;
  onClose: () => void;
}

// Centered overlay modal — appears at all viewport widths when mounted.
// Row menu "Change category" triggers this; CategoryPill's own dropdown handles direct-click at desktop.
export default function CategoryPickerModal({ transactionId, currentCategory, onSelect, onClose }: Props) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      data-testid="category-picker-modal"
      className="fixed inset-0 z-50 flex items-center justify-center"
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-[8px]" onClick={onClose} />
      <div className="relative bg-[var(--color-elevated)] border border-[var(--color-border-default)] rounded-[var(--radius-lg)] w-[calc(100vw-32px)] max-w-sm z-50 max-h-[70vh] overflow-y-auto">
        <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-[var(--color-border-subtle)]">
          <p className="font-(--font-display) text-[16px] text-(--color-text-primary)">Change category</p>
          <button
            onClick={onClose}
            className="p-1 text-(--color-text-tertiary) hover:text-(--color-text-primary) transition-colors"
          >
            <X size={16} />
          </button>
        </div>
        <div className="py-1">
          {Object.entries(CATEGORY_META).map(([key, m]) => (
            <button
              key={key}
              onClick={() => { onSelect(transactionId, key); onClose(); }}
              className={`w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-[var(--color-border-subtle)] transition-colors ${key === currentCategory ? "opacity-100" : "opacity-70 hover:opacity-100"}`}
            >
              <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${m.color}`}>{m.label}</span>
              {key === currentCategory && (
                <span className="ml-auto text-[10px] text-(--color-text-tertiary)">current</span>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
