import { VERDICT_THRESHOLDS } from "../mortgage/defaults";
import { type DealResult } from "../mortgage/flip";

/**
 * Why a house got the verdict it got, one check at a time.
 *
 * The verdicts were a word and a sentence fragment. That tells you the answer
 * and nothing about how to change it — and changing it is the entire job. Each
 * check here states what was measured, what it came to, what it needed to be,
 * and whether it passed, in the order someone would ask.
 *
 * Every percentage says what it is a percentage of. "15% margin" is a figure
 * only the person who wrote it understands.
 */

export interface DealCheck {
  id: string;
  /** What was checked, in plain words. */
  label: string;
  passed: boolean;
  /** "$13,466 (5% of the cash in the deal)" */
  actual: string;
  /** "Want $15,000 and 10% to be Thin, $25,000 and 15% to Work." */
  target: string;
  /** Only on a failing check: the thing that would fix it. */
  fix?: string;
}

export interface ExplainInput {
  deal: DealResult;
  /** Cash left after closing, and what a month of payments costs. */
  cashAfterClosing: number | null;
  monthlyPayment: number;
  /** Null for hard money, which has no income test at all. */
  backDti: number | null;
  dtiLimit: number;
  /** True until the sold houses behind the resale price have been answered on. */
  arvUnreviewed: boolean;
  /** From the offer-ceiling search, when one could be found. */
  priceForThin?: number | null;
  priceForWorks?: number | null;
}

function money(n: number): string {
  return `$${Math.round(n).toLocaleString()}`;
}

/**
 * What one verdict tag says when you tap it.
 *
 * Three parts in the order someone asks them: what is wrong, what it needed
 * to be, and what would change it. The third is the only one that is ever
 * acted on, and it was the one the tags never carried.
 */
export interface VerdictExplanation {
  /** What is wrong, or right, in this house's own numbers. */
  whatsWrong: string;
  /** What the figure needed to be, and why that is the number. */
  target: string;
  /** Absent when nothing needs fixing. */
  fix?: string;
}

export interface VerdictExplanations {
  afford: VerdictExplanation;
  deal: VerdictExplanation;
  /** Only present while the sold houses behind the resale price are unchecked. */
  arv: VerdictExplanation | null;
}

/**
 * Margin, spelled out.
 *
 * It is true profit over the resale price — not over what the deal costs,
 * which is the other thing "margin" commonly means. Every place the word
 * appears says which, because a percentage whose denominator is a guess is
 * worse than no percentage.
 */
export const MARGIN_DEFINITION = "true profit ÷ the resale price";

export interface VerdictExplainInput {
  deal: DealResult;
  /** Cash left once closing is paid for. Null when it cannot be worked out. */
  cashAfterClosing: number | null;
  /** The full monthly payment, which is what reserves are counted in. */
  monthlyPayment: number;
  /** Combined loan-to-value, for the no-equity case. */
  combinedLtv: number;
  /** The affordability verdict's own reasons, most severe first. */
  affordReasons: { kind: "blocker" | "caution"; text: string }[];
  affordVerdict: "qualifies" | "tight" | "does_not_qualify";
  dealVerdict: "works" | "thin" | "does_not_work";
  needsProfile: boolean;
  arvUnreviewed: boolean;
  /** The highest price that still clears the floor, from the ceiling search. */
  priceForThin?: number | null;
  priceForWorks?: number | null;
}

function explainAfford(input: VerdictExplainInput): VerdictExplanation {
  const t = VERDICT_THRESHOLDS;

  if (input.needsProfile) {
    return {
      whatsWrong: "There is no income on file, so nothing can be checked against it.",
      target: "Your monthly income before tax, and the debts you already pay.",
      fix: "Add them in Settings → Profile. A hard money loan does not need them.",
    };
  }

  // The two Tight cases have different fixes, so they are told apart rather
  // than both falling back to the verdict's own one-liner.
  const reserves = input.cashAfterClosing;
  const wantReserves = input.monthlyPayment * t.cashReservesTightMonths;
  const shortOnReserves =
    reserves !== null && input.monthlyPayment > 0 && reserves < wantReserves;

  const noEquity = input.combinedLtv > t.combinedLtvTightPct;

  if (input.affordVerdict === "does_not_qualify") {
    const blocker = input.affordReasons.find((r) => r.kind === "blocker");
    return {
      whatsWrong: blocker ? `${blocker.text}.` : "This one does not clear the lender's limits.",
      target: "Every one of the lender's limits has to clear, not most of them.",
      fix: "A lower price, a bigger down payment, or paying off a debt first.",
    };
  }

  if (noEquity) {
    return {
      whatsWrong: `Your loans cover ${input.combinedLtv.toFixed(0)}% of the price, so you start with no equity.`,
      target: `Under ${t.combinedLtvTightPct}% leaves a cushion. A low appraisal or a dip in the market could otherwise leave you owing more than the house is worth.`,
      fix: "A bigger down payment, or less assistance.",
    };
  }

  if (shortOnReserves) {
    return {
      whatsWrong: `You'd have ${money(Math.max(0, reserves))} left after closing.`,
      target: `Keep at least ${t.cashReservesTightMonths} months of payments (${money(wantReserves)}) in case something goes wrong.`,
      fix: `${money(wantReserves - Math.max(0, reserves))} more cash, or a lower price.`,
    };
  }

  if (input.affordVerdict === "tight") {
    const caution = input.affordReasons[0];
    return {
      whatsWrong: caution ? `${caution.text}.` : "This one clears, but with nothing to spare.",
      target: "Clearing every limit with room left over.",
      fix: "A lower price, or more cash at closing.",
    };
  }

  return {
    whatsWrong: "You're inside your ratios with the cash to close it.",
    target: `${t.cashReservesTightMonths} months of payments left over, and under ${t.combinedLtvTightPct}% borrowed.`,
  };
}

function explainDealVerdict(input: VerdictExplainInput): VerdictExplanation {
  const t = VERDICT_THRESHOLDS;
  const { deal } = input;

  if (deal.arv === null || deal.trueProfit === null) {
    return {
      whatsWrong: "There's no resale price yet, so there's nothing to judge.",
      target:
        "A resale price worked out from houses like this one that have already sold, each one checked.",
      fix: "Open the ARV tab and add the sold houses nearby.",
    };
  }

  const marginText =
    deal.marginPct === null
      ? ""
      : ` — ${deal.marginPct.toFixed(0)}% of the ${money(deal.arv)} resale price`;

  // The ceiling search answers "what would I have to pay for this to work",
  // which is the only lever the buyer actually controls here.
  const offer =
    input.priceForWorks != null
      ? `Offer ${money(input.priceForWorks)} or less.`
      : input.priceForThin != null
        ? `Offer ${money(input.priceForThin)} or less to reach Thin.`
        : null;

  const target =
    `${money(t.dealMinProfitThin)} and ${t.dealMarginThinPct}% of the resale price to be Thin, ` +
    `${money(t.dealMinProfitWorks)} and ${t.dealMarginWorksPct}% to Work. ` +
    `Margin is ${MARGIN_DEFINITION}.`;

  if (input.dealVerdict === "does_not_work") {
    const losing = deal.trueProfit < 0;
    return {
      whatsWrong: losing
        ? `This deal loses ${money(Math.abs(deal.trueProfit))} after holding costs.`
        : `True profit is ${money(deal.trueProfit)}${marginText}.`,
      target,
      fix: offer ?? "A cheaper rehab, a shorter hold, or a higher resale price.",
    };
  }

  if (input.dealVerdict === "thin") {
    return {
      whatsWrong: `True profit is ${money(deal.trueProfit)}${marginText}. It clears the floor but not the target.`,
      target,
      fix: offer ?? "A lower price, or a cheaper rehab.",
    };
  }

  return {
    whatsWrong: `True profit is ${money(deal.trueProfit)}${marginText}.`,
    target,
  };
}

/**
 * Every tag on a house, explained from one place.
 *
 * The cards and the house's own header both read this, so a tag cannot say
 * one thing in the list and another on the page.
 */
export function explainVerdicts(input: VerdictExplainInput): VerdictExplanations {
  return {
    afford: explainAfford(input),
    deal: explainDealVerdict(input),
    arv:
      input.arvUnreviewed && input.deal.arv !== null
        ? {
            whatsWrong: `The ${money(input.deal.arv)} resale price uses sold houses you haven't checked yet.`,
            target: "Some may not be renovated, which would make it too high.",
            fix: "Check them on the ARV tab.",
          }
        : null,
  };
}

/** The ARV a deal would need to clear a profit target at today's price. */
export function arvForProfit(deal: DealResult, target: number): number | null {
  if (deal.arv === null || deal.trueProfit === null) return null;
  // Every dollar of resale price is a dollar of profit, less the seller's cut
  // of it. Close enough to quote, and labelled as the figure it is.
  const shortfall = target - deal.trueProfit;
  if (shortfall <= 0) return null;
  return deal.arv + shortfall;
}

export function explainDeal(input: ExplainInput): DealCheck[] {
  const t = VERDICT_THRESHOLDS;
  const checks: DealCheck[] = [];
  const { deal } = input;

  // ── Is the ARV trustworthy at all ─────────────────────────────────────────
  if (deal.arv === null) {
    checks.push({
      id: "arv",
      label: "Resale price (ARV)",
      passed: false,
      actual: "Not worked out yet.",
      target: "Needed before any of this can be judged.",
      fix:
        "Open the ARV tab, add the sold houses nearby, and answer \"Was it fixed up like yours will be?\" on each.",
    });
    return checks;
  }

  if (input.arvUnreviewed) {
    checks.push({
      id: "arv-unreviewed",
      label: "Resale price (ARV) not checked",
      passed: false,
      actual: `Using ${money(deal.arv)}, built from every sold house that came back.`,
      target: "Some of those houses may not be comparable.",
      fix:
        "Open the ARV tab and answer \"Was it fixed up like yours will be?\" on each one.",
    });
  }

  // ── Cash left after closing ───────────────────────────────────────────────
  if (input.cashAfterClosing !== null && input.monthlyPayment > 0) {
    const want = input.monthlyPayment * t.cashReservesTightMonths;
    const passed = input.cashAfterClosing >= want;
    checks.push({
      id: "reserves",
      label: "Cash left after closing",
      passed,
      actual: money(input.cashAfterClosing),
      target: `Want ${t.cashReservesTightMonths} months of payments (${money(want)}).`,
      fix: passed
        ? undefined
        : `${money(want - input.cashAfterClosing)} more cash available would cover it. One surprise could stall the work otherwise.`,
    });
  }

  // ── What the deal makes ───────────────────────────────────────────────────
  if (deal.trueProfit !== null) {
    const worksProfit = deal.trueProfit >= t.dealMinProfitWorks;
    const worksMargin = (deal.marginPct ?? 0) >= t.dealMarginWorksPct;
    const passed = worksProfit && worksMargin;

    const marginText =
      deal.marginPct === null
        ? ""
        : ` (${deal.marginPct.toFixed(0)}% of the ${money(deal.arv)} resale price)`;

    const fixes: string[] = [];
    if (!passed) {
      if (input.priceForWorks != null) {
        fixes.push(`Offer ${money(input.priceForWorks)} or less to Work.`);
      } else if (input.priceForThin != null) {
        fixes.push(`Offer ${money(input.priceForThin)} or less to reach Thin.`);
      }
      const arvNeeded = arvForProfit(deal, t.dealMinProfitWorks);
      if (arvNeeded !== null) {
        fixes.push(`Or the resale price would need to be about ${money(arvNeeded)}.`);
      }
    }

    checks.push({
      id: "profit",
      label: "What you keep after everything",
      passed,
      actual: `${money(deal.trueProfit)}${marginText}`,
      target: `Want ${money(t.dealMinProfitThin)} and ${t.dealMarginThinPct}% of the resale price to be Thin, ${money(t.dealMinProfitWorks)} and ${t.dealMarginWorksPct}% to Work.`,
      fix: fixes.length > 0 ? fixes.join(" ") : undefined,
    });
  }

  // ── Can the borrower carry it ─────────────────────────────────────────────
  if (input.backDti !== null) {
    const passed = input.backDti <= input.dtiLimit;
    checks.push({
      id: "dti",
      label: "Share of your income going to debt",
      passed,
      actual: `${input.backDti.toFixed(0)}%`,
      target: `Lenders here stop at ${input.dtiLimit}%.`,
      fix: passed
        ? undefined
        : "Paying off a smaller debt, or offering less, brings this down.",
    });
  } else {
    checks.push({
      id: "dti",
      label: "Share of your income going to debt",
      passed: true,
      actual: "Doesn't apply.",
      target: "This loan is judged on the house, not your income.",
    });
  }

  return checks;
}
