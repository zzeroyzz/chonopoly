"use client";

import { useEffect, useRef } from "react";
import { Check } from "lucide-react";
import { STAGES, STAGE_LABEL, isBackwards } from "@/lib/crm/stages";
import { type Stage } from "@/lib/crm/types";

/**
 * Stage picker, opened from the row's stage badge.
 *
 * A menu rather than a swipe. Swipe-to-advance is undiscoverable, and it can't
 * express the two moves that matter most here: jumping straight to closed or
 * dead from anywhere, and going backwards when a deal stalls. Every stage is
 * one tap away, including the ones that go the wrong way — a stalled deal
 * returning to contacted is normal, so nothing here blocks it.
 */
export function StageMenu({
  current,
  onPick,
  onClose,
}: {
  current: Stage;
  onPick: (stage: Stage) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      data-testid="stage-menu"
      className="absolute z-30 mt-1 left-0 min-w-[190px] bg-(--color-surface) border border-(--color-border-default) rounded-[var(--radius-md)] shadow-[var(--shadow-lg)] py-1"
    >
      {STAGES.map((s) => {
        const isCurrent = s === current;
        const backwards = !isCurrent && isBackwards(current, s);
        return (
          <button
            key={s}
            type="button"
            data-testid={`stage-option-${s}`}
            onClick={() => {
              if (!isCurrent) onPick(s);
              onClose();
            }}
            className="w-full text-left px-3 py-2 text-[13px] flex items-center justify-between gap-3 hover:bg-(--color-surface-hover) transition-colors"
          >
            <span className={isCurrent ? "text-(--color-text-primary)" : "text-(--color-text-secondary)"}>
              {STAGE_LABEL[s]}
            </span>
            {isCurrent ? (
              <Check size={13} className="text-(--color-accent) shrink-0" />
            ) : backwards ? (
              // Said, not blocked. The move is legitimate; it just shouldn't
              // happen by accident.
              <span className="text-[9px] uppercase tracking-wider text-(--color-text-tertiary) shrink-0">
                back
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
