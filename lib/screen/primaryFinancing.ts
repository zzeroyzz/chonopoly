/**
 * Which financing numbers speak for a house.
 *
 * Its own module, free of the database client, so the Properties list and
 * `scripts/backfill-list-price.ts` use one rule and a test can check it.
 */

export interface AnalysisRow {
  property_id: string | null;
  kind: string;
  is_primary: boolean;
  label: string;
  inputs: unknown;
  inputs_version: number;
}

/**
 * Each house's financing numbers: the primary, or else the first one, so a
 * house with numbers but no primary still shows them.
 */
export function primaryFinancingByProperty(analyses: AnalysisRow[]): Map<string, AnalysisRow> {
  const primary = new Map<string, AnalysisRow>();
  for (const analysis of analyses) {
    if (!analysis.property_id || analysis.kind !== "financing") continue;
    const existing = primary.get(analysis.property_id);
    if (!existing || (analysis.is_primary && !existing.is_primary)) {
      primary.set(analysis.property_id, analysis);
    }
  }
  return primary;
}

/**
 * The price somebody actually typed into these numbers, or null.
 *
 * Read from what was stored, not through `readInputs`, which fills a missing
 * price with the calculator's $350,000 default — a default must never be
 * copied anywhere as if it were the house's price.
 */
export function storedHomeValue(inputs: unknown): number | null {
  if (typeof inputs !== "object" || inputs === null) return null;
  const value = (inputs as { homeValue?: unknown }).homeValue;
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}
