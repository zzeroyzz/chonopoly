"use client";

import { ExternalLink } from "lucide-react";
import { type Comp } from "@/lib/comps/types";

/**
 * Somewhere to go and look at a comp.
 *
 * A comp is an address and a price, and neither tells you whether the house
 * was renovated — which is the one thing that decides whether it belongs in
 * the ARV at all. Every comp carries a way to go and see it.
 *
 * Five pills, all visible. This was a link plus a chevron that opened a menu
 * of three more: two controls to reach four places, on a screen where the
 * whole job is going out to look and coming back. The places are the content
 * here, so they are on the card.
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
    /**
     * Keeps listing photos longest, and often has them when the others don't.
     *
     * A site-scoped search rather than a direct link. realtor.com addresses a
     * listing by its own internal id, which we do not have, and its
     * address-shaped search URL resolves to the surrounding zip — so the
     * direct-looking version landed on a neighbourhood, not the house.
     */
    realtor: `https://www.google.com/search?q=site%3Arealtor.com+${q}`,
    /**
     * A search, not a deep link, and the wording on screen says so.
     *
     * County record sites differ per county and we usually do not know the
     * county: `Comp.county` is only populated on a public-record comp, so it
     * is null on everything RentCast returns. A search for the county's own
     * record is the honest mechanism available.
     */
    records: `https://www.google.com/search?q=${q}+county+property+records`,
    maps: `https://www.google.com/maps/search/?api=1&query=${q}`,
  };
}

export type CompLinkSource = keyof ReturnType<typeof searchUrls>;

const SOURCES: { id: CompLinkSource; label: string; title: string }[] = [
  { id: "zillow", label: "Zillow", title: "Photo history, usually the best" },
  { id: "realtor", label: "Realtor", title: "Holds listing photos longest" },
  {
    id: "records",
    label: "Records",
    title: "Searches for the county record. Works when the photos are gone.",
  },
  { id: "maps", label: "Map", title: "Where it is" },
];

export function CompLinks({
  comp,
  opened,
  onOpen,
}: {
  comp: Comp;
  /** The source already opened for this comp: its pill stays lit. */
  opened?: CompLinkSource | null;
  onOpen?: (source: CompLinkSource) => void;
}) {
  const urls = searchUrls(comp.formattedAddress);
  // A hand-entered comp's own listing beats a search for it.
  const ownListing =
    comp.source === "manual" && comp.notes?.startsWith("http") ? comp.notes : null;

  return (
    // Wraps to a second row rather than squeezing: five 44px targets do not
    // fit one line at 390px, and a squeezed target is a missed tap.
    <div className="flex flex-wrap items-center gap-1.5" data-testid={`comp-links-${comp.id}`}>
      {SOURCES.map((source) => {
        const isOpen = opened === source.id;
        return (
          <a
            key={source.id}
            href={source.id === "zillow" && ownListing ? ownListing : urls[source.id]}
            target="_blank"
            rel="noopener noreferrer"
            title={source.title}
            onClick={() => onOpen?.(source.id)}
            data-testid={`comp-link-${source.id}-${comp.id}`}
            /* border-default is 8% white, which on an elevated card reads as
               no edge at all — the pills ghosted. */
            className={`inline-flex items-center gap-1.5 min-h-11 px-3.5 rounded-(--radius-pill)
              border text-[12px] font-semibold transition-colors ${
                isOpen
                  ? "border-(--color-accent) bg-(--color-accent-glow) text-(--color-accent)"
                  : "border-(--color-border-strong) bg-(--color-base) text-(--color-text-primary) hover:border-(--color-accent)"
              }`}
          >
            <ExternalLink size={11} className="shrink-0" />
            {isOpen ? `${source.label} — opened` : source.label}
          </a>
        );
      })}
    </div>
  );
}
