"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { type VerdictExplanation } from "@/lib/deal/explainDeal";

/**
 * A verdict tag that explains itself.
 *
 * The tags were the answer with none of the reasoning: "Tight" tells you the
 * house is a problem and nothing about which problem or what would change it,
 * which is the entire reason to look. Each one is now a button, and what it
 * opens says what is wrong, what the figure needed to be, and the one thing
 * that would fix it — in this house's own numbers, not in general.
 *
 * Hover on a mouse, tap on a phone. Which one is decided by whether the
 * device actually has a hover, rather than by width: a touch screen fires a
 * synthetic mouseenter on tap, so wiring both at once makes the panel open
 * and immediately close again.
 */

const GUTTER = 8;
const WIDTH = 272;

interface Props {
  /** The word on the tag: "Tight", "Works", "ARV not checked". */
  label: string;
  /** The pill's colour classes, owned by the page that knows the verdict. */
  toneClassName: string;
  explanation: VerdictExplanation;
  /** Where "See full breakdown →" goes. */
  breakdownHref: string;
  /**
   * Replaces the breakdown link.
   *
   * Takes an `onClick` as well as an `href` because on the house's own page
   * the destination is a tab on the page you are already on — a navigation
   * there would reload the house to move a tab.
   */
  action?: { label: string; href?: string; onClick?: () => void };
  testId?: string;
}

export function VerdictTag({
  label,
  toneClassName,
  explanation,
  breakdownHref,
  action,
  testId,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Decided once, on the client. `(hover: hover)` is false on a phone even
  // when the window is wide, which is the distinction that matters here.
  const [canHover, setCanHover] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCanHover(window.matchMedia("(hover: hover)").matches);
  }, []);

  const place = useCallback(() => {
    const button = buttonRef.current;
    if (!button) return;
    const r = button.getBoundingClientRect();
    // Clamped to the viewport so the panel cannot hang off a 390px screen,
    // which is where every one of these is actually read.
    const left = Math.min(
      Math.max(GUTTER, r.left),
      Math.max(GUTTER, window.innerWidth - WIDTH - GUTTER)
    );
    setCoords({ top: r.bottom + 6, left });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    function onPointer(e: PointerEvent) {
      const t = e.target as Node;
      if (panelRef.current?.contains(t) || buttonRef.current?.contains(t)) return;
      setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  const hoverProps = canHover
    ? {
        onMouseEnter: () => setOpen(true),
        onMouseLeave: () => setOpen(false),
        onFocus: () => setOpen(true),
        onBlur: () => setOpen(false),
      }
    : {};

  const link = action ?? { label: "See full breakdown →", href: breakdownHref };

  return (
    // `relative z-10` lifts the tag above the card-wide link overlay on the
    // Properties list. Without it, tapping a tag opens the house instead.
    <span className="relative z-10 inline-flex" {...hoverProps}>
      <button
        ref={buttonRef}
        type="button"
        data-testid={testId}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded cursor-help
          underline decoration-dotted decoration-from-font underline-offset-2
          focus:outline-none focus-visible:ring-1 focus-visible:ring-(--color-accent) ${toneClassName}`}
      >
        {label}
      </button>

      {open && coords && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label={`Why this says ${label}`}
          data-testid={testId ? `${testId}-popover` : undefined}
          style={{ position: "fixed", top: coords.top, left: coords.left, width: WIDTH }}
          className="z-50 rounded-[var(--radius-lg)] border border-(--color-border-strong)
            bg-(--color-overlay) shadow-[var(--shadow-lg)] p-3 text-left normal-case tracking-normal"
        >
          <p className="text-[12px] text-(--color-text-primary) leading-relaxed">
            {explanation.whatsWrong}
          </p>
          <p className="text-[11px] text-(--color-text-secondary) leading-relaxed mt-1.5">
            {explanation.target}
          </p>
          {explanation.fix && (
            <p className="text-[11px] text-(--color-text-primary) leading-relaxed mt-1.5">
              <span className="text-(--color-accent) font-medium">Fix: </span>
              {explanation.fix}
            </p>
          )}

          <button
            type="button"
            data-testid={testId ? `${testId}-breakdown` : undefined}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setOpen(false);
              if (link.onClick) link.onClick();
              else if (link.href) router.push(link.href);
            }}
            className="mt-2.5 text-[11px] font-medium text-(--color-accent) hover:underline"
          >
            {link.label}
          </button>
        </div>
      )}
    </span>
  );
}
