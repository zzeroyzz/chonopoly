"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { type ShellNavItem } from "./types";

interface Props {
  items: ShellNavItem[];
  activeNavId: string | null;
  pathname: string | null;
  onSelect: (item: ShellNavItem) => void;
  onClose: () => void;
}

/**
 * Secondary destinations, opened from the More tab.
 *
 * Centered overlay rather than a bottom sheet or a side drawer: CLAUDE.md allows
 * centered modals only, and the mobile top bar carries an explicit "no hamburger"
 * decision. Same pattern as the app's other modals (backdrop + elevated panel).
 */
export function MoreMenu({ items, activeNavId, pathname, onSelect, onClose }: Props) {
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-60 bg-black/50 px-4"
      onClick={onClose}
      data-testid="more-menu"
    >
      <div
        className="bg-(--color-elevated) border border-(--color-border-default) rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[80vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-(--color-border-subtle)">
          <span className="text-[10px] uppercase tracking-[0.1em] text-(--color-text-tertiary) font-medium">
            More
          </span>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-(--color-text-tertiary) hover:text-(--color-text-primary) transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-2 overflow-y-auto">
          {items.map((item) => {
            const active = item.href
              ? pathname === item.href.split("?")[0]
              : activeNavId === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  onSelect(item);
                  onClose();
                }}
                className={`w-full flex items-center gap-3 h-12 px-3 rounded-[var(--radius-md)] text-[14px] transition-colors ${
                  active
                    ? "text-(--color-accent) bg-(--color-accent)/10"
                    : "text-(--color-text-secondary) hover:text-(--color-text-primary) hover:bg-(--color-border-subtle)"
                }`}
              >
                <span className={active ? "text-(--color-accent)" : "text-(--color-text-tertiary)"}>
                  {item.icon}
                </span>
                {item.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
