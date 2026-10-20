"use client";

import { useEffect, useRef, useState } from "react";
import { ExternalLink, ChevronDown } from "lucide-react";
import { type Comp } from "@/lib/comps/types";

/**
 * Somewhere to go and look at a comp.
 *
 * A comp is an address and a price, and neither tells you whether the house
 * was renovated — which is the one thing that decides whether it belongs in
 * the ARV at all. Every comp now carries a way to go and see it.
 *
 * The links are built from the address rather than stored, because RentCast
 * does not hand back listing URLs. A search is not as good as a deep link,
 * but it lands on the right house and costs nothing. A comp typed in by hand
 * uses the listing URL that was entered with it, which is better than any
 * search.
 */

/**
 * Exported so the property page can link to the subject house the same way.
 * One definition: a second copy would drift the moment one of these sites
 * changes its URL shape.
 */
export function searchUrls(address: string) {
  const q = encodeURIComponent(address);
  return {
    zillow: `https://www.zillow.com/homes/${q}_rb/`,
    redfin: `https://www.redfin.com/search?query=${q}`,
    maps: `https://www.google.com/maps/search/?api=1&query=${q}`,
  };
}

export function CompLinks({ comp }: { comp: Comp }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointer(e: PointerEvent) {
      if (wrapRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const urls = searchUrls(comp.formattedAddress);
  // A hand-entered comp's own listing beats a search for it.
  const primaryHref = comp.source === "manual" && comp.notes?.startsWith("http")
    ? comp.notes
    : urls.zillow;
  const primaryLabel = primaryHref === urls.zillow ? "View on Zillow" : "View listing";

  const others: { label: string; href: string }[] = [
    ...(primaryHref === urls.zillow ? [] : [{ label: "Zillow", href: urls.zillow }]),
    { label: "Redfin", href: urls.redfin },
    { label: "Google Maps", href: urls.maps },
  ];

  return (
    <span ref={wrapRef} className="relative inline-flex items-center gap-1.5">
      <a
        href={primaryHref}
        target="_blank"
        rel="noopener noreferrer"
        data-testid={`comp-link-${comp.id}`}
        className="inline-flex items-center gap-1 text-[11px] text-(--color-accent) hover:underline"
      >
        <ExternalLink size={11} />
        {primaryLabel}
      </a>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`More links for ${comp.formattedAddress}`}
        data-testid={`comp-links-more-${comp.id}`}
        className="inline-flex items-center text-(--color-text-tertiary) hover:text-(--color-text-primary) transition-colors"
      >
        <ChevronDown size={12} />
      </button>

      {open && (
        <span
          role="menu"
          data-testid={`comp-links-menu-${comp.id}`}
          className="absolute left-0 top-full mt-1 z-30 min-w-[9rem] rounded-[var(--radius-md)]
            border border-(--color-border-strong) bg-(--color-overlay) shadow-[var(--shadow-md)] py-1"
        >
          {others.map((link) => (
            <a
              key={link.label}
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="block px-3 py-1.5 text-[12px] text-(--color-text-primary) hover:bg-(--color-elevated)"
            >
              {link.label}
            </a>
          ))}
        </span>
      )}
    </span>
  );
}
