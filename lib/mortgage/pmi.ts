/**
 * Conventional PMI rates band by loan-to-value. The spread inside each band is
 * mostly credit score, which this calculator doesn't model — so a single number
 * is always an estimate, and the UI says so by showing the band alongside it.
 *
 * Ranges are the commonly published annual premium ranges for borrower-paid
 * monthly PMI on a fixed-rate primary residence. Any real quote beats them, and
 * the field stays editable for exactly that reason.
 */

export interface PmiBand {
  /** Inclusive lower bound of the LTV band, in percent. */
  minLtv: number;
  /** Exclusive upper bound, in percent. */
  maxLtv: number;
  low: number;
  high: number;
}

export const PMI_BANDS: PmiBand[] = [
  { minLtv: 80, maxLtv: 85.0001, low: 0.19, high: 0.32 },
  { minLtv: 85.0001, maxLtv: 90.0001, low: 0.23, high: 0.52 },
  { minLtv: 90.0001, maxLtv: 95.0001, low: 0.3, high: 0.78 },
  { minLtv: 95.0001, maxLtv: 101, low: 0.45, high: 1.1 },
];

export function ltvPercent(loanAmount: number, homeValue: number): number {
  if (homeValue <= 0) return 0;
  return (loanAmount / homeValue) * 100;
}

/** The band covering this LTV, or null at 80% or below where PMI doesn't apply. */
export function pmiBandForLtv(ltv: number): PmiBand | null {
  if (ltv <= 80) return null;
  return PMI_BANDS.find((b) => ltv > b.minLtv && ltv <= b.maxLtv) ?? PMI_BANDS[PMI_BANDS.length - 1];
}

/**
 * Suggested annual PMI rate for an LTV.
 *
 * `conservative` picks the top of the band instead of the middle. Used when
 * solving for maximum affordable price, where the error is asymmetric: guessing
 * low sends the user shopping above what they'd actually qualify for, which is
 * the expensive direction to be wrong in.
 */
export function suggestedPmiRate(ltv: number, conservative = false): number {
  const band = pmiBandForLtv(ltv);
  if (!band) return 0;
  return conservative ? band.high : Number(((band.low + band.high) / 2).toFixed(3));
}

/** "0.30–0.78%" for display next to the value in use. */
export function formatPmiBand(band: PmiBand): string {
  return `${band.low.toFixed(2)}–${band.high.toFixed(2)}%`;
}
