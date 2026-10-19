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
  /** True until someone has ticked the comps the ARV is built from. */
  arvUnreviewed: boolean;
  /** From the offer-ceiling search, when one could be found. */
  priceForThin?: number | null;
  priceForWorks?: number | null;
}

function money(n: number): string {
  return `$${Math.round(n).toLocaleString()}`;
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
      fix: "Add comps on the ARV step and tick the ones that have been renovated.",
    });
    return checks;
  }

  if (input.arvUnreviewed) {
    checks.push({
      id: "arv-unreviewed",
      label: "Resale price (ARV) not checked",
      passed: false,
      actual: `Using ${money(deal.arv)}, built from every comp that came back.`,
      target: "Some of those houses may not be comparable.",
      fix: "Open the ARV step and tick the ones that have actually been renovated.",
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
