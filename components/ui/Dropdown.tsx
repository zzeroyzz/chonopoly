"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";

/**
 * A dropdown that looks like the rest of the app.
 *
 * A native `<select>` is the right control on a phone and the wrong one here:
 * the option list is painted by the OS, so it arrives white with an orange
 * highlight in the middle of a dark screen, and it cannot show the coloured
 * dot that says at a glance whether a comp counts.
 *
 * So this is a listbox, built from what the repo already has. Everything a
 * native select gives you for free has to be put back by hand, and the parts
 * that matter are:
 *
 *   - roles: button[aria-haspopup=listbox] + [role=listbox] / [role=option]
 *   - arrow keys move the ACTIVE option without committing it; Enter commits;
 *     Esc closes and keeps the old value; Home/End jump
 *   - aria-activedescendant, so a screen reader follows the arrow keys
 *     without focus actually leaving the button
 *   - focus returns to the button on close, or the keyboard is stranded
 *   - closing on outside pointerdown and on scroll
 *
 * Deliberately not generic beyond what is used: one list, one selection.
 */

export type DropdownTone = "neutral" | "good" | "warn";

const DOT: Record<DropdownTone, string> = {
  neutral: "bg-(--color-text-tertiary)",
  good: "bg-(--color-accent)",
  warn: "bg-amber-400",
};

export interface DropdownOption<T extends string> {
  value: T;
  label: string;
  tone?: DropdownTone;
}

export function Dropdown<T extends string>({
  value,
  options,
  onChange,
  label,
  testId,
  className = "",
}: {
  value: T;
  options: DropdownOption<T>[];
  onChange: (value: T) => void;
  /** Announced to a screen reader. Not drawn — the button shows the choice. */
  label: string;
  testId?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(() =>
    Math.max(0, options.findIndex((o) => o.value === value))
  );
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const id = useId();

  const selected = options.find((o) => o.value === value) ?? options[0];

  const close = useCallback((returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) buttonRef.current?.focus();
  }, []);

  // Open on the current choice, not wherever the arrows were left last time.
  function openList() {
    setActiveIndex(Math.max(0, options.findIndex((o) => o.value === value)));
    setOpen(true);
  }

  function commit(index: number) {
    const option = options[index];
    if (option) onChange(option.value);
    close(true);
  }

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (buttonRef.current?.contains(target) || listRef.current?.contains(target)) return;
      // No focus return: the pointer has already moved somewhere else.
      close(false);
    };
    // A list pinned under a button is wrong the moment the page scrolls.
    const onScroll = () => close(false);

    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open, close]);

  // Keep the active option in view when the arrows walk past the edge.
  useEffect(() => {
    if (!open) return;
    listRef.current
      ?.querySelector(`[data-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [open, activeIndex]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openList();
      }
      return;
    }

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActiveIndex((i) => Math.min(options.length - 1, i + 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setActiveIndex((i) => Math.max(0, i - 1));
        break;
      case "Home":
        e.preventDefault();
        setActiveIndex(0);
        break;
      case "End":
        e.preventDefault();
        setActiveIndex(options.length - 1);
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        commit(activeIndex);
        break;
      case "Escape":
        e.preventDefault();
        // Esc keeps the value it had. That is the whole contract of Esc.
        close(true);
        break;
      case "Tab":
        close(false);
        break;
    }
  }

  return (
    <div className={`relative ${className}`}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => (open ? close(true) : openList())}
        onKeyDown={onKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
        aria-controls={open ? `${id}-list` : undefined}
        aria-activedescendant={open ? `${id}-option-${activeIndex}` : undefined}
        data-testid={testId}
        className="w-full min-h-11 flex items-center gap-2 rounded-lg border border-(--color-border-default) bg-(--color-base) px-3 text-left text-[12px]"
      >
        <span className={`size-2 shrink-0 rounded-full ${DOT[selected?.tone ?? "neutral"]}`} />
        <span className="flex-1 min-w-0 truncate">{selected?.label}</span>
        <ChevronDown size={14} className="shrink-0 text-(--color-text-tertiary)" />
      </button>

      {open && (
        <ul
          ref={listRef}
          id={`${id}-list`}
          role="listbox"
          aria-label={label}
          tabIndex={-1}
          data-testid={testId ? `${testId}-list` : undefined}
          className="absolute z-20 mt-1 w-full max-h-64 overflow-y-auto rounded-lg border border-(--color-border-default) bg-(--color-elevated) py-1 shadow-lg"
        >
          {options.map((option, index) => {
            const isSelected = option.value === value;
            return (
              <li
                key={option.value}
                id={`${id}-option-${index}`}
                role="option"
                aria-selected={isSelected}
                data-index={index}
                data-testid={testId ? `${testId}-option-${option.value}` : undefined}
                // pointerdown, not click: the outside-close listener also runs
                // on pointerdown and would shut the list before click fired.
                onPointerDown={(e) => {
                  e.preventDefault();
                  commit(index);
                }}
                onPointerEnter={() => setActiveIndex(index)}
                className={`min-h-11 flex items-center gap-2 px-3 text-[12px] cursor-pointer ${
                  index === activeIndex ? "bg-(--color-base)" : ""
                }`}
              >
                <span className={`size-2 shrink-0 rounded-full ${DOT[option.tone ?? "neutral"]}`} />
                <span className="flex-1 min-w-0">{option.label}</span>
                {isSelected && <Check size={13} className="shrink-0 text-(--color-accent)" />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
