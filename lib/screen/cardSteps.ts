import { type ScreenRow } from "./screenRow";
import { NO_LISTING_PRICE_LABEL } from "../property/types";

/**
 * The Properties card's own rules: how far a house has got, where its steps
 * link to, and how its price and resale price are worded.
 *
 * Lifted out of PropertiesPage so they are tested as functions. The card
 * renders what these return.
 */

type CardRow = Pick<ScreenRow, "arv" | "checklist" | "walkAwayCash">;

/**
 * The same four steps the property page shows, in the same order, so the card
 * and the page agree about where a house has got to.
 */
export const FLOW_STEPS = [
  // A house exists the moment it is added, so this one is always done.
  { label: "Details", tab: "details", done: () => true },
  { label: "ARV", tab: "arv", done: (r: CardRow) => r.arv !== null },
  { label: "Numbers", tab: "numbers", done: (r: CardRow) => r.checklist.numbers },
  { label: "Deal", tab: "deal", done: (r: CardRow) => r.walkAwayCash !== null },
] as const;

export interface CardSteps {
  done: number;
  total: number;
  /** "2 of 4 steps" */
  label: string;
  /**
   * The tab the count opens. The count is a way in, not just a score: it opens
   * the first step still to do, or the deal once everything is.
   */
  nextTab: (typeof FLOW_STEPS)[number]["tab"];
}

export function cardSteps(row: CardRow): CardSteps {
  const done = FLOW_STEPS.filter((step) => step.done(row)).length;
  const next = FLOW_STEPS.find((step) => !step.done(row)) ?? FLOW_STEPS[FLOW_STEPS.length - 1];
  return {
    done,
    total: FLOW_STEPS.length,
    label: `${done} of ${FLOW_STEPS.length} steps`,
    nextTab: next.tab,
  };
}

/**
 * "Checked or not", in plain words. A checked price says nothing on the card:
 * the verdict already rests on it.
 */
export function resaleUncheckedLine(row: Pick<ScreenRow, "arv">): string | null {
  return row.arv === null ? "Resale price not checked yet →" : null;
}

/**
 * Null when there is a listing price to show as a figure; otherwise the words
 * that stand in for one. Never the calculator's $350,000 default.
 */
export function missingPriceLabel(listPrice: number | null): string | null {
  return listPrice === null ? NO_LISTING_PRICE_LABEL : null;
}
