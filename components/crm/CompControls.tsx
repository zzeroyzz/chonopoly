"use client";

import { type Comp, isReviewable, isSkipped } from "@/lib/comps/types";
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

/**
 * What stays in the dropdown.
 *
 * "Needs review", "Approved" and "Skipped" have left it: they are the two
 * halves of the work and they are now tabs. Burying how much is left inside a
 * menu of seven meant opening the menu to find out. The other four narrow
 * what is inside a tab, which is what a filter is for.
 *
 * They stay in `CompFilter` and in `matchesFilter` — the tabs are defined in
 * terms of them, so there is still one definition of what "skipped" means.
 */
export const FILTER_ORDER: CompFilter[] = ["all", "sold", "listings", "flagged"];

/** The two halves of the work. */
export type ReviewTab = "todo" | "done";

export const TAB_LABELS: Record<ReviewTab, string> = {
  todo: "Still to check",
  done: "Checked",
};

/** Checked is both answers: what counts, and what was looked at and left out. */
const TAB_FILTERS: Record<ReviewTab, CompFilter[]> = {
  todo: ["needs_review"],
  done: ["approved", "skipped"],
};

export function matchesTab(comp: Comp, note: CompNote | undefined, tab: ReviewTab): boolean {
  // A house still on the market cannot be judged, so it is in neither half of
  // the work. It is context, and the Listings filter is where it lives.
  if (!isReviewable(comp.status)) return false;
  return TAB_FILTERS[tab].some((filter) => matchesFilter(comp, note, filter));
}

export function tabCounts(comps: Comp[], notes: Map<string, CompNote>): Record<ReviewTab, number> {
  return {
    todo: comps.filter((c) => matchesTab(c, notes.get(c.id), "todo")).length,
    done: comps.filter((c) => matchesTab(c, notes.get(c.id), "done")).length,
  };
}

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

/**
 * Every filter, which is not the same list as the dropdown's.
 *
 * `FILTER_ORDER` is what the menu offers. Counting only those left
 * `counts.approved` undefined the moment the work filters moved to tabs, and
 * it reached the screen as "undefined of 81 approved".
 */
const EVERY_FILTER: CompFilter[] = [
  "needs_review",
  "approved",
  "skipped",
  "all",
  "sold",
  "listings",
  "flagged",
];

export function filterCounts(
  comps: Comp[],
  notes: Map<string, CompNote>
): Record<CompFilter, number> {
  const counts = {} as Record<CompFilter, number>;
  for (const filter of EVERY_FILTER) {
    counts[filter] = comps.filter((c) => matchesFilter(c, notes.get(c.id), filter)).length;
  }
  return counts;
}

/**
 * Where to start: the work still to do, or the work already done.
 *
 * Opening on "Still to check" is the point — it is the list to work through.
 * Once nothing is left, that view is empty and useless, so it opens on what
 * the ARV is actually built from instead.
 *
 * This replaces `defaultFilter`, which returned a filter value that no longer
 * appears in the dropdown.
 */
export function defaultTab(comps: Comp[]): ReviewTab {
  // Reads the same predicate the tab does. Asking only about `needs_review`
  // opened Still-to-check on a house whose comps are all active — the tab
  // that rule had just emptied, on exactly the houses it was written for.
  return comps.some((c) => c.review === "needs_review" && isReviewable(c.status))
    ? "todo"
    : "done";
}

export function CompControls({
  sort,
  filter,
  counts,
  shown,
  total,
  showFilter = true,
  onSortChange,
  onFilterChange,
}: {
  sort: CompSort;
  filter: CompFilter;
  counts: Record<CompFilter, number>;
  shown: number;
  total: number;
  /**
   * Off while reviewing one house at a time.
   *
   * A filter narrows a list you are scanning. On a one-at-a-time queue it
   * silently shortens the work instead, and "Showing 4 of 11" describes a
   * list that is not on screen. Sort still earns its place there: it decides
   * the order you work through them.
   */
  showFilter?: boolean;
  onSortChange: (sort: CompSort) => void;
  onFilterChange: (filter: CompFilter) => void;
}) {
  return (
    <div data-testid="comp-controls" className="flex flex-col gap-2">
      {/* Wraps onto a second line rather than scrolling sideways. */}
      <div className="flex flex-wrap items-center gap-2">
        {showFilter && (
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
        )}

        <Dropdown
          className="flex-1 min-w-[150px]"
          value={sort}
          options={SORT_ORDER.map((key) => ({ value: key, label: SORT_LABELS[key] }))}
          onChange={onSortChange}
          label="Sort comps"
          testId="comp-sort"
        />
      </div>

      {showFilter && (
        <p data-testid="comp-shown" className="text-[12px] text-(--color-text-secondary)">
          Showing {shown} of {total}
        </p>
      )}
    </div>
  );
}

/**
 * The two halves of the work, under the filter and sort.
 *
 * Both counts are always on screen, because watching the left one go down is
 * the only thing that tells you the job ends. They were two of seven options
 * inside a menu, which meant opening the menu to find out how much was left.
 *
 * The count is the big text and the name is the small text: the number is
 * what the eye is looking for.
 */
export function CompReviewTabs({
  tab,
  counts,
  onTabChange,
}: {
  tab: ReviewTab;
  counts: Record<ReviewTab, number>;
  onTabChange: (tab: ReviewTab) => void;
}) {
  const tabs: ReviewTab[] = ["todo", "done"];

  return (
    <div
      role="tablist"
      aria-label="Which half of the work"
      data-testid="comp-tabs"
      className="flex gap-2"
    >
      {tabs.map((key) => {
        const selected = tab === key;
        return (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onTabChange(key)}
            data-testid={`comp-tab-${key}`}
            className={`flex-1 min-h-11 flex flex-col items-start justify-center gap-0.5 px-3 py-2
              rounded-(--radius-md) border text-left transition-colors ${
                selected
                  ? "border-(--color-accent) bg-(--color-accent-glow) text-(--color-text-primary)"
                  : "border-(--color-border-default) text-(--color-text-secondary)"
              }`}
          >
            <span className="text-[16px] font-bold leading-none" data-testid={`comp-tab-${key}-count`}>
              {counts[key]}
            </span>
            <span className="text-[11px] leading-none">{TAB_LABELS[key]}</span>
          </button>
        );
      })}
    </div>
  );
}
