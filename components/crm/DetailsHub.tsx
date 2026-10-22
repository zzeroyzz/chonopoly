"use client";

import { ArrowRight } from "lucide-react";
import { dollars } from "@/components/mortgage/format";
import { type ScreenRow } from "@/lib/screen/screenRow";
import { type Task } from "@/lib/crm/types";
import { type ResolvedRehab } from "@/lib/rehab/resolveRehab";
import { Skeleton } from "@/components/ui/Skeleton";

/**
 * Where this house stands, section by section.
 *
 * A house has six tabs and there was no way to see where it stood without
 * opening each one. Every figure below is already on the page by the time
 * this renders, so this is a reader: no request, no calculation, nothing
 * that could disagree with the tab it links to.
 *
 * Each tile says three things in this order, and the order is the point:
 * what it is, where it stands, and what to do next. The third line is what
 * makes a tile worth tapping rather than reading.
 */

export interface TileCopy {
  /** What it is, in the owner's words. Never a tab name. */
  title: string;
  /** Where it stands: a figure, or the state in words. */
  state: string;
  /** What to do next. Always present — a tile with nothing to do is finished, and says so. */
  next: string;
}

/** Whole dollars. No figure on this screen is decided by cents. */
const money = (n: number) => dollars(n, 0);

export function arvTile(row: ScreenRow): TileCopy {
  if (row.arv === null) {
    return {
      title: "Worth fixed up?",
      state: "Not checked yet",
      next:
        row.compsToReview > 0
          ? `${row.compsToReview} ${row.compsToReview === 1 ? "house" : "houses"} to go through`
          : "Pull the houses nearby to get started",
    };
  }
  return {
    title: "Worth fixed up?",
    state: money(row.arv),
    next:
      row.compsToReview > 0
        ? `From ${row.approvedComps} ${row.approvedComps === 1 ? "house" : "houses"} · ${row.compsToReview} still to check`
        : `From ${row.approvedComps} ${row.approvedComps === 1 ? "house" : "houses"} you checked`,
  };
}

export function numbersTile(row: ScreenRow): TileCopy {
  return {
    title: "The numbers",
    state: `${money(row.piti)} a month`,
    next: `${money(row.cashToClose)} to close`,
  };
}

export function dealTile(row: ScreenRow): TileCopy {
  if (!row.deal.hasArv || row.trueProfit === null) {
    return {
      title: "The deal",
      state: "No resale price yet",
      next: "Check the houses nearby first",
    };
  }
  return {
    title: "The deal",
    state: `${money(row.trueProfit)} profit`,
    // "Margin" alone means nothing. Say what the percentage is a percentage of.
    next:
      row.marginPct === null
        ? "What you'd make on this one"
        : `${row.marginPct.toFixed(0)}% of the resale price`,
  };
}

export function workTile(rehab: ResolvedRehab): TileCopy {
  // A default of zero is not a house that needs no work — it is a house
  // nobody has costed yet. "$0 to fix up" states the first and means the
  // second, which is the one reading that sends somebody into a flip blind.
  if (rehab.budgetOnly && rehab.total === 0) {
    return {
      title: "The work",
      state: "Not set yet",
      next: "Set a budget, or walk it for a real figure",
    };
  }
  return {
    title: "The work",
    state: `${money(rehab.total)} to fix up`,
    // A budget is a guess you set; an estimate is one somebody made from the
    // house. Showing the figure without saying which is how a default gets
    // mistaken for a survey.
    next: rehab.budgetOnly
      ? "Your default — walk it to get a real figure"
      : rehab.label,
  };
}

export function activityTile(tasks: Task[], now: Date = new Date()): TileCopy {
  const open = tasks.filter((t) => t.completed_at === null);
  const overdue = open.filter((t) => new Date(t.due_date) < now);

  if (open.length === 0) {
    return {
      title: "What's happening",
      state: "Nothing scheduled",
      next: "Nobody is chasing this one",
    };
  }
  return {
    title: "What's happening",
    state: `${open.length} ${open.length === 1 ? "task" : "tasks"} open`,
    next:
      overdue.length > 0
        ? `${overdue.length} already overdue`
        : "All of them still in hand",
  };
}

/**
 * One tile.
 *
 * The whole thing is the target, not the arrow: a 44px arrow on a card this
 * size is a smaller thing to hit than the card itself.
 */
function Tile({
  copy,
  onOpen,
  testId,
  span = false,
}: {
  copy: TileCopy;
  onOpen: () => void;
  testId: string;
  /** Take the whole row, so an odd tile count leaves no hole beside the last one. */
  span?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      data-testid={testId}
      className={`flex flex-col items-start gap-1 min-h-11 p-3 text-left rounded-(--radius-lg)
        border border-(--color-border-default) bg-(--color-surface)
        hover:border-(--color-border-strong) transition-colors ${span ? "col-span-2" : ""}`}
    >
      <span className="text-[11px] text-(--color-text-secondary)">{copy.title}</span>
      <span className="text-[15px] font-semibold text-(--color-text-primary) leading-snug">
        {copy.state}
      </span>
      <span className="flex items-center gap-1 text-[11px] text-(--color-text-secondary)">
        {copy.next}
        <ArrowRight size={11} className="shrink-0" />
      </span>
    </button>
  );
}

/** Holds each tile's height so the grid does not grow under a reaching thumb. */
function TileSkeleton() {
  return (
    <div className="flex flex-col gap-2 p-3 rounded-(--radius-lg) border border-(--color-border-default)">
      <Skeleton className="h-2.5 w-20" />
      <Skeleton className="h-4 w-28" />
      <Skeleton className="h-2.5 w-24" />
    </div>
  );
}

export function DetailsHub({
  row,
  screenLoaded,
  rehab,
  tasks,
  onOpenTab,
}: {
  /** Null until the screen request lands, and for good if it fails. */
  row: ScreenRow | null;
  screenLoaded: boolean;
  rehab: ResolvedRehab;
  tasks: Task[];
  onOpenTab: (tab: "ARV" | "Numbers" | "Deal" | "Rehab" | "Activity") => void;
}) {
  /**
   * Whether the last tile takes the whole row, which is a counting question.
   *
   * Five single tiles in two columns leave the fifth alone beside a hole, so
   * it spans. On a failed screen request the count changes — one full-width
   * message, then work and activity — and those two pair off, so it does not.
   */
  const screenFailed = screenLoaded && row === null;

  return (
    <div data-testid="details-hub" className="grid grid-cols-2 gap-2 mt-4">
      {!screenLoaded ? (
        <>
          <TileSkeleton />
          <TileSkeleton />
          <TileSkeleton />
        </>
      ) : row === null ? (
        /* A tile that vanishes on a failed request is one the owner thinks
           they imagined. It says so, and still goes where it was going. */
        <button
          type="button"
          onClick={() => onOpenTab("Numbers")}
          data-testid="hub-unavailable"
          className="col-span-2 flex flex-col items-start gap-1 p-3 text-left rounded-(--radius-lg)
            border border-(--color-border-default) bg-(--color-surface)"
        >
          <span className="text-[15px] font-semibold text-(--color-text-primary)">
            Couldn&apos;t work the numbers out
          </span>
          <span className="flex items-center gap-1 text-[11px] text-(--color-text-secondary)">
            Open them and we&apos;ll try again
            <ArrowRight size={11} className="shrink-0" />
          </span>
        </button>
      ) : (
        <>
          <Tile copy={arvTile(row)} onOpen={() => onOpenTab("ARV")} testId="hub-tile-arv" />
          <Tile copy={numbersTile(row)} onOpen={() => onOpenTab("Numbers")} testId="hub-tile-numbers" />
          <Tile copy={dealTile(row)} onOpen={() => onOpenTab("Deal")} testId="hub-tile-deal" />
        </>
      )}

      {/* Neither reads `row`, so both render whether the screen landed or not. */}
      <Tile copy={workTile(rehab)} onOpen={() => onOpenTab("Rehab")} testId="hub-tile-work" />
      <Tile
        copy={activityTile(tasks)}
        onOpen={() => onOpenTab("Activity")}
        testId="hub-tile-activity"
        span={!screenFailed}
      />
    </div>
  );
}
