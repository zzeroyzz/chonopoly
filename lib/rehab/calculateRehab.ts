import {
  type RehabEstimate,
  type RehabLine,
  type RehabSystem,
  type RehabEstimateSource,
} from "./types";

/**
 * Add up the checklist and apply the contingency the source earns.
 *
 * Two contingencies, not one, and which applies is decided by where the
 * estimate came from rather than by the user choosing a number. Listing photos
 * cannot see a cracked heat exchanger or a cast-iron stack, so a photo
 * estimate carries more padding than a walkthrough does. Making it automatic
 * is the point: the padding should fall when someone has actually been inside,
 * and nobody remembers to lower it by hand.
 */

export interface RehabSystemTotal {
  system: RehabSystem;
  cost: number;
}

export interface RehabResult {
  /** Per system, in checklist order, for the breakdown. */
  bySystem: RehabSystemTotal[];
  /** Before contingency. */
  subtotal: number;
  /** Which percentage applied, so the line can say so. */
  contingencyPct: number;
  contingency: number;
  total: number;
  source: RehabEstimateSource;
  /** How many systems still need pricing — a repair or replace costed at $0. */
  unpriced: number;
}

export interface ContingencyDefaults {
  photosPct: number;
  visitPct: number;
}

/** Good is always $0, whatever is typed in the box. */
export function lineCost(line: RehabLine): number {
  return line.condition === "good" ? 0 : Math.max(0, line.cost);
}

export function calculateRehab(
  estimate: RehabEstimate,
  contingency: ContingencyDefaults
): RehabResult {
  const bySystem = estimate.lines.map((line) => ({
    system: line.system,
    cost: lineCost(line),
  }));

  const subtotal = bySystem.reduce((sum, row) => sum + row.cost, 0);

  const contingencyPct = Math.max(
    0,
    estimate.source === "visit" ? contingency.visitPct : contingency.photosPct
  );
  const contingencyAmount = subtotal * (contingencyPct / 100);

  // A system marked repair or replace with nothing in the cost box is not a
  // free repair — it is one nobody has priced. Counting them lets the UI say
  // so rather than quietly reporting a total that is too low.
  const unpriced = estimate.lines.filter(
    (line) => line.condition !== "good" && Math.max(0, line.cost) === 0
  ).length;

  return {
    bySystem,
    subtotal,
    contingencyPct,
    contingency: contingencyAmount,
    total: subtotal + contingencyAmount,
    source: estimate.source,
    unpriced,
  };
}

export interface BudgetCheck {
  budget: number;
  estimate: number;
  /** Positive when the estimate exceeds the budget. */
  over: number;
  isOver: boolean;
  /** "Budget $45k · Estimate $52k · $7k over" */
  summary: string;
}

function short(value: number): string {
  const rounded = Math.round(value);
  if (Math.abs(rounded) >= 1_000) return `$${Math.round(rounded / 1_000)}k`;
  return `$${rounded.toLocaleString()}`;
}

/**
 * The budget check, in the one form it appears in everywhere.
 *
 * Built here rather than at each call site so the Rehab tab, the Profit card,
 * the property cards and the verdicts cannot word it three different ways or
 * disagree about what counts as over.
 */
export function budgetCheck(budget: number, estimate: number): BudgetCheck {
  const b = Math.max(0, budget);
  const e = Math.max(0, estimate);
  const over = Math.max(0, e - b);

  return {
    budget: b,
    estimate: e,
    over,
    isOver: over > 0.5,
    summary:
      over > 0.5
        ? `Budget ${short(b)} · Estimate ${short(e)} · ${short(over)} over`
        : `Budget ${short(b)} · Estimate ${short(e)}`,
  };
}
