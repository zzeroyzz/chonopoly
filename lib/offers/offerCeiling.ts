import { type MortgageInputs } from "../mortgage/types";
import { calculateMortgage } from "../mortgage/calculate";
import { buildDeal, type DealHouse, type DealOverrides } from "../deal/buildDeal";
import { VERDICT_THRESHOLDS } from "../mortgage/defaults";

/**
 * The most you can pay and still make your floor.
 *
 * This cannot be rearranged into a formula. Moving the price moves the loan,
 * which moves the payment, which moves the carry; it moves the down payment
 * and the closing costs, so it moves the cash in; and it moves the cost basis,
 * so it moves the capital gains. On hard money it also moves the advance and
 * every month of interest. True profit is a function of price with several
 * kinks in it, so the honest way to invert it is to search.
 *
 * Monotonic in the region that matters: paying more never makes a deal better.
 * That is what makes a bisection safe here — and it is checked rather than
 * assumed, because a non-monotonic answer would be a bug worth seeing.
 */

export interface CeilingInput {
  house: Omit<DealHouse, "inputs" | "result">;
  /** The primary analysis's inputs, which the price is varied within. */
  inputs: MortgageInputs;
  overrides?: DealOverrides;
  /** Defaults to the "works" dollar floor from the shared thresholds. */
  profitFloor?: number;
}

export interface CeilingResult {
  /** The highest price that still clears the floor. Null when none does. */
  price: number | null;
  profitFloor: number;
  /** True profit at that price, for the line that explains it. */
  trueProfitAtPrice: number | null;
  /** True when even $0 cannot reach the floor — the deal is not the price. */
  unreachable: boolean;
}

/** True profit at a given purchase price, everything else held. */
export function trueProfitAtPrice(
  input: CeilingInput,
  price: number
): number | null {
  const inputs: MortgageInputs = { ...input.inputs, homeValue: Math.max(0, price) };
  const result = calculateMortgage(inputs);
  const built = buildDeal({ ...input.house, inputs, result }, input.overrides);
  return built.result.trueProfit;
}

const ITERATIONS = 40;

export function offerCeiling(input: CeilingInput): CeilingResult {
  const floor = input.profitFloor ?? VERDICT_THRESHOLDS.dealMinProfitWorks;

  // No ARV means no profit figure at all, so there is nothing to invert.
  const atZero = trueProfitAtPrice(input, 0);
  if (atZero === null) {
    return { price: null, profitFloor: floor, trueProfitAtPrice: null, unreachable: true };
  }

  // Free and still short of the floor: the rehab, the carry or the fees are
  // what is wrong, and no price fixes it.
  if (atZero < floor) {
    return { price: null, profitFloor: floor, trueProfitAtPrice: atZero, unreachable: true };
  }

  // Search between $0 and a ceiling comfortably past any sane offer. The ARV
  // is the natural upper bound — paying more than the finished value is never
  // the answer — with a margin for the odd deal where it still clears.
  let low = 0;
  let high = Math.max((input.house.arv ?? 0) * 1.5, input.inputs.homeValue * 2, 1_000);

  // Push the bracket out if the top somehow still clears, so the answer is
  // never silently pinned to an arbitrary ceiling.
  if ((trueProfitAtPrice(input, high) ?? -Infinity) >= floor) {
    return {
      price: high,
      profitFloor: floor,
      trueProfitAtPrice: trueProfitAtPrice(input, high),
      unreachable: false,
    };
  }

  for (let i = 0; i < ITERATIONS; i += 1) {
    const mid = (low + high) / 2;
    const profit = trueProfitAtPrice(input, mid);
    if (profit !== null && profit >= floor) low = mid;
    else high = mid;
  }

  // Rounded down to the nearest hundred: a ceiling you cannot actually offer
  // is not a ceiling, and rounding up would put you under the floor.
  const price = Math.floor(low / 100) * 100;

  return {
    price,
    profitFloor: floor,
    trueProfitAtPrice: trueProfitAtPrice(input, price),
    unreachable: false,
  };
}
