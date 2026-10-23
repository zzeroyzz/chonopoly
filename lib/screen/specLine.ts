/**
 * The house's own facts as short labels: "3 bed", "2 bath", "1,180 sq ft".
 *
 * One place, because the list card and the house page both show them and
 * used to format them separately. A fact nobody entered is null rather than
 * "0 bed", which would read as a fact about the house.
 */

export interface SpecFacts {
  beds: number | null;
  baths: number | null;
  sqft: number | null;
}

export interface SpecLabels {
  beds: string | null;
  baths: string | null;
  sqft: string | null;
}

/** Fixed, so the server and the phone agree on "1,180" whatever the locale. */
const NUMBER_FORMAT = new Intl.NumberFormat("en-US");

function known(value: number | null): value is number {
  return value !== null && Number.isFinite(value) && value >= 0;
}

export function specLabels(facts: SpecFacts): SpecLabels {
  return {
    beds: known(facts.beds) ? `${NUMBER_FORMAT.format(facts.beds)} bed` : null,
    baths: known(facts.baths) ? `${NUMBER_FORMAT.format(facts.baths)} bath` : null,
    sqft: known(facts.sqft) && facts.sqft > 0 ? `${NUMBER_FORMAT.format(facts.sqft)} sq ft` : null,
  };
}

/** The labels that exist, in reading order, for a one-line spec. */
export function specLine(facts: SpecFacts): string[] {
  const labels = specLabels(facts);
  return [labels.beds, labels.baths, labels.sqft].filter(
    (label): label is string => label !== null
  );
}
