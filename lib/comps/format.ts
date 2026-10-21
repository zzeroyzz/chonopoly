import { dollars } from "@/components/mortgage/format";
import { ORGANIZATION_BUYER } from "./fromPropertyRecords";
import { type Comp, type CompStatus } from "./types";

/**
 * How a comp says itself out loud.
 *
 * These were private to `CompsPanel.tsx`, which is fine while one component
 * renders a comp and wrong the moment two do. The review card needs most of
 * them, and it cannot reach back into `CompsPanel` for them — `CompsPanel`
 * imports the card, so that would close a cycle.
 *
 * They are pure: a comp in, a string out, no React. Moving them is the whole
 * change — the one exception is noted on `fixerUpperNote`.
 *
 * `dollars` lives under `components/`, so this module reaches up a layer.
 * Deliberate and recorded in the plan: moving `dollars` down into `lib/`
 * touches the mortgage components and is a separate piece of work.
 */

/** "$380k" — the way a price range gets said out loud. */
export function dollarsShort(n: number): string {
  return `$${Math.round(n / 1000).toLocaleString("en-US")}k`;
}

/** "Oct 18" — the form the lock message reads best in. */
export function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function monthYear(iso: string): string {
  // Day-level precision is noise here; what matters is how stale the comp is.
  return new Date(iso).toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

export function perSqft(comp: Comp): string | null {
  if (comp.price === null || comp.sqft === null || comp.sqft <= 0) return null;
  return `$${Math.round(comp.price / comp.sqft)}/sqft`;
}

/**
 * What this comp's price actually is.
 *
 * Only a sale gets a qualifier, because only a sale's price is a fact about
 * what someone paid. Active and Removed carry their own label beside the
 * price and say enough on their own.
 */
const PRICE_MEANING: Partial<Record<CompStatus, string>> = {
  sold: "sold for",
};

/**
 * What the figure beside the price means on this comp.
 *
 * A removed listing the owner has marked sold shows both numbers, so the
 * first one has to say which it is: "Listed at $348,560 · Sold for $335,000".
 */
export function priceLabel(comp: Comp): string | null {
  if (comp.salePrice !== null) return "Listed at";
  return PRICE_MEANING[comp.status] ?? null;
}

/**
 * Where a sold comp's price came from.
 *
 * A county deed and an agent's closed-sales list are both real sales, but
 * they are not the same kind of fact, and a reader deciding whether to trust
 * a number is entitled to know which one they are looking at.
 */
export function provenanceLabel(comp: Comp): string | null {
  if (comp.status !== "sold") return null;
  return comp.source === "public_record" ? "county record" : "you entered this";
}

/**
 * Why this sale might be below what a finished house is worth.
 *
 * The decision is the ARV's, not this component's: it depends on what the
 * counted comps fetched, which a single card cannot see. Here we only phrase
 * it.
 */
export function fixerUpperNote(comp: Comp): string | null {
  if (comp.price === null) return null;

  const boughtBy =
    comp.buyerType === ORGANIZATION_BUYER
      ? `Bought by a company${comp.buyerName ? ` (${comp.buyerName})` : ""}`
      : "Sold";

  // Was "Untick it to leave it out." The tick stopped existing when the review
  // control replaced it, so this told the owner to use a thing that is gone.
  return (
    `${boughtBy} for ${dollars(comp.price)}, which may be below what a finished ` +
    `house here is worth. Mark it "Not renovated" to leave it out.`
  );
}

/** The house being bought, as far as a comparison needs to know it. */
export interface SubjectFacts {
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  yearBuilt: number | null;
}

/**
 * How this house differs from yours, in words.
 *
 * The question being answered eleven times in a row is "is this one like
 * mine?", and pinning your own specs to the top of the screen left the owner
 * to do the subtraction in their head, eleven times. This does it.
 *
 * Differences only. "3 bed" is already on the card above; what is not there
 * is whether 3 is the same as yours.
 */
export function comparedToSubject(comp: Comp, subject: SubjectFacts): string | null {
  const parts: string[] = [];

  if (comp.beds !== null && subject.beds !== null) {
    const diff = comp.beds - subject.beds;
    const count = Math.abs(diff);
    parts.push(
      diff === 0
        ? "same beds"
        : `${count} ${count === 1 ? "bed" : "beds"} ${diff > 0 ? "more" : "fewer"}`
    );
  }

  if (comp.baths !== null && subject.baths !== null && comp.baths !== subject.baths) {
    const diff = comp.baths - subject.baths;
    const count = Math.abs(diff);
    parts.push(`${count} ${count === 1 ? "bath" : "baths"} ${diff > 0 ? "more" : "fewer"}`);
  }

  if (comp.sqft !== null && subject.sqft !== null && subject.sqft > 0) {
    const diff = comp.sqft - subject.sqft;
    // Fifty feet is a hallway. Calling it a difference makes every house
    // look different from every other one, which tells you nothing.
    parts.push(
      Math.abs(diff) < 50
        ? "about the same size"
        : `${Math.abs(diff).toLocaleString("en-US")} sq ft ${diff > 0 ? "bigger" : "smaller"}`
    );
  }

  if (comp.yearBuilt !== null && subject.yearBuilt !== null) {
    const diff = comp.yearBuilt - subject.yearBuilt;
    const years = Math.abs(diff);
    // Two years apart is the same building stock, not a difference worth
    // reading on every card.
    parts.push(
      years <= 2 ? "built around the same time" : `${years} years ${diff > 0 ? "newer" : "older"}`
    );
  }

  return parts.length > 0 ? parts.join(", ") : null;
}

/**
 * The date that matters for this comp, and what it means.
 *
 * Which date is relevant depends on the status, so the label says which one is
 * being shown. "Jul 2026" on its own leaves the reader guessing whether the
 * house sold then or merely came to market.
 */
export function compDate(comp: Comp): string | null {
  if (comp.status === "sold") {
    return comp.removedDate ? `Sold ${monthYear(comp.removedDate)}` : null;
  }
  if (comp.status === "removed") {
    return comp.removedDate ? `Removed ${monthYear(comp.removedDate)}` : null;
  }
  return comp.listedDate ? `Listed ${monthYear(comp.listedDate)}` : null;
}
