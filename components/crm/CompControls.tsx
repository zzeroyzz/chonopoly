"use client";

import { type Comp, isSkipped } from "@/lib/comps/types";
import { type CompNote } from "@/lib/comps/arv";
import { Dropdown } from "@/components/ui/Dropdown";

/**
 * Sorting and filtering for the comp list.
 *
 * These change what is on screen and nothing else. The ARV is built from the
 * reviews, so hiding a comp never moves the number — the one thing a filter
 * on a valuation screen must not do quietly.
 *
 * Two dropdowns, no bulk buttons: approving comps in batches is how the
 * number starts moving without anyone meaning it to.
 */

export type CompSort = "closest" | "recent" | "priceHigh" | "priceLow" | "sizeClosest";

export const SORT_LABELS: Record<CompSort, string> = {
  closest: "Closest first",
  recent: "Most recent sale",
  priceHigh: "Price high to low",
  priceLow: "Price low to high",
  sizeClosest: "Size closest to this house",
};

export type CompFilter =
  | "needs_review"
  | "approved"
  | "skipped"
  | "all"
  | "sold"
  | "listings"
  | "flagged";

export const FILTER_LABELS: Record<CompFilter, string> = {
  needs_review: "Needs review",
  approved: "Approved",
  skipped: "Skipped",
  all: "All",
  sold: "Sold",
  listings: "Listings",
  flagged: "Flagged",
};

export const FILTER_ORDER: CompFilter[] = [
  "needs_review",
  "approved",
  "skipped",
  "all",
  "sold",
  "listings",
  "flagged",
];

export const SORT_ORDER: CompSort[] = [
  "closest",
  "recent",
  "priceHigh",
  "priceLow",
  "sizeClosest",
];

/** The same green/amber/grey the review dots use. */
const FILTER_TONE: Record<CompFilter, "neutral" | "good" | "warn"> = {
  needs_review: "neutral",
  approved: "good",
  skipped: "warn",
  all: "neutral",
  sold: "neutral",
  listings: "neutral",
  flagged: "warn",
};

export function matchesFilter(comp: Comp, note: CompNote | undefined, filter: CompFilter): boolean {
  switch (filter) {
    case "all":
      return true;
    case "needs_review":
      return comp.review === "needs_review";
    case "approved":
      return comp.review === "renovated_use";
    case "skipped":
      // Was a hardcoded pair that never learned about took_off_market_skip, so
      // a comp taken off market matched no filter but All.
      return isSkipped(comp.review);
    case "sold":
      return comp.status === "sold";
    case "listings":
      return comp.status !== "sold";
    case "flagged":
      return note?.fixerUpper === true;
  }
}

/** A stable sort: equal comps keep the order the server sent them in. */
export function sortComps(comps: Comp[], sort: CompSort, subjectSqft: number | null): Comp[] {
  const value = (comp: Comp): number => {
    switch (sort) {
      case "closest":
        return comp.distanceMiles ?? Number.POSITIVE_INFINITY;
      case "recent": {
        const date = comp.removedDate ?? comp.lastSeenDate ?? comp.listedDate;
        // Newest first, so a missing date sorts last rather than first.
        return date ? -new Date(date).getTime() : Number.POSITIVE_INFINITY;
      }
      case "priceHigh":
        return comp.price === null ? Number.POSITIVE_INFINITY : -comp.price;
      case "priceLow":
        return comp.price === null ? Number.POSITIVE_INFINITY : comp.price;
      case "sizeClosest":
        if (comp.sqft === null || subjectSqft === null) return Number.POSITIVE_INFINITY;
        return Math.abs(comp.sqft - subjectSqft);
    }
  };

  return [...comps]
    .map((comp, index) => ({ comp, index, key: value(comp) }))
    .sort((a, b) => (a.key === b.key ? a.index - b.index : a.key - b.key))
    .map((entry) => entry.comp);
}

export function filterCounts(
  comps: Comp[],
  notes: Map<string, CompNote>
): Record<CompFilter, number> {
  const counts = {} as Record<CompFilter, number>;
  for (const filter of FILTER_ORDER) {
    counts[filter] = comps.filter((c) => matchesFilter(c, notes.get(c.id), filter)).length;
  }
  return counts;
}

/**
 * Where to start: the work still to do, or the work already done.
 *
 * Opening on "Needs review" is the point — it is the list to work through.
 * Once nothing is left, that view is empty and useless, so it opens on what
 * the ARV is actually built from instead.
 */
export function defaultFilter(comps: Comp[]): CompFilter {
  return comps.some((c) => c.review === "needs_review") ? "needs_review" : "approved";
}

export function CompControls({
  sort,
  filter,
  counts,
  shown,
  total,
  onSortChange,
  onFilterChange,
}: {
  sort: CompSort;
  filter: CompFilter;
  counts: Record<CompFilter, number>;
  shown: number;
  total: number;
  onSortChange: (sort: CompSort) => void;
  onFilterChange: (filter: CompFilter) => void;
}) {
  return (
    <div data-testid="comp-controls" className="flex flex-col gap-2">
      {/* Wraps onto a second line rather than scrolling sideways. */}
      <div className="flex flex-wrap items-center gap-2">
        <Dropdown
          className="flex-1 min-w-[150px]"
          value={filter}
          options={FILTER_ORDER.map((key) => ({
            value: key,
            label: `Show: ${FILTER_LABELS[key]} · ${counts[key]}`,
            tone: FILTER_TONE[key],
          }))}
          onChange={onFilterChange}
          label="Show which comps"
          testId="comp-filter"
        />

        <Dropdown
          className="flex-1 min-w-[150px]"
          value={sort}
          options={SORT_ORDER.map((key) => ({ value: key, label: SORT_LABELS[key] }))}
          onChange={onSortChange}
          label="Sort comps"
          testId="comp-sort"
        />
      </div>

      <p data-testid="comp-shown" className="text-[12px] text-(--color-text-secondary)">
        Showing {shown} of {total}
      </p>
    </div>
  );
}
