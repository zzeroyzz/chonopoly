import { type DpaStructure } from "./types";

/**
 * What down payment assistance costs you when you sell.
 *
 * Assistance was modelled as one bit — grant or not — and the deal analyzer
 * repaid nothing on a grant and the full award on anything else. That is two
 * answers to a question with four, and it put $0 on a Profit card for a loan
 * that really does get repaid at closing.
 *
 * The four structures differ in exactly one way that matters here: how much is
 * still owed on the day you sell.
 *
 *   Grant        never repaid
 *   Deferred     the whole amount, due at sale
 *   Forgivable   forgiven over a term; whatever has not been forgiven is due
 *   Amortizing   a real second lien; the remaining balance is due
 */

/** Forgiven all at once at the end of the term, or a slice each year. */
export type ForgivenessStyle = "cliff" | "prorated";

export interface DpaTerms {
  enabled: boolean;
  structure: DpaStructure;
  /** The award. Fixed by the program rather than chosen. */
  amount: number;
  /** Forgivable: the full term before nothing is owed. */
  forgivenessYears: number;
  forgivenessStyle: ForgivenessStyle;
  /** Amortizing: the second lien's own rate and term. */
  ratePct: number;
  termYears: number;
}

export interface DpaRepayment {
  /** Owed at closing, out of the sale proceeds. */
  dueAtSale: number;
  forgiven: number;
  /** "Deferred · $10,000 due at sale" — shown on the line. */
  explanation: string;
}

function money(n: number): string {
  return `$${Math.round(n).toLocaleString()}`;
}

/** Whole years elapsed. Forgiveness credits a year once it is behind you. */
function yearsHeld(holdMonths: number): number {
  return Math.floor(Math.max(0, holdMonths) / 12);
}

export function dpaRepaymentAtSale(terms: DpaTerms, holdMonths: number): DpaRepayment {
  if (!terms.enabled || terms.amount <= 0) {
    return { dueAtSale: 0, forgiven: 0, explanation: "No assistance on this loan" };
  }

  const amount = Math.max(0, terms.amount);
  const held = yearsHeld(holdMonths);

  switch (terms.structure) {
    case "grant":
      return {
        dueAtSale: 0,
        forgiven: amount,
        explanation: `Grant · ${money(amount)} never repaid`,
      };

    case "forgivable": {
      const term = Math.max(1, Math.round(terms.forgivenessYears));
      const remainingYears = Math.max(0, term - held);

      // Cliff forgives nothing until the term is served, which is why selling
      // in year four of five costs the whole award rather than a fifth of it.
      const forgiven =
        terms.forgivenessStyle === "cliff"
          ? held >= term
            ? amount
            : 0
          : amount * (Math.min(held, term) / term);

      const dueAtSale = Math.max(0, amount - forgiven);

      if (remainingYears === 0) {
        return { dueAtSale: 0, forgiven: amount, explanation: `Forgivable · fully forgiven` };
      }
      return {
        dueAtSale,
        forgiven,
        explanation: `Forgivable · ${remainingYears} of ${term} years left · ${money(dueAtSale)}`,
      };
    }

    case "amortizing": {
      // A real second lien. Whatever principal has not been paid off over the
      // hold comes due out of the proceeds.
      const months = Math.max(0, Math.round(holdMonths));
      const n = Math.max(1, Math.round(terms.termYears * 12));
      const r = Math.max(0, terms.ratePct) / 100 / 12;

      let balance = amount;
      if (r === 0) {
        balance = Math.max(0, amount - (amount / n) * Math.min(months, n));
      } else {
        const payment = (amount * r) / (1 - Math.pow(1 + r, -n));
        for (let m = 0; m < Math.min(months, n); m += 1) {
          balance = Math.max(0, balance - (payment - balance * r));
        }
      }

      return {
        dueAtSale: balance,
        forgiven: 0,
        explanation: `Amortizing second · ${money(balance)} balance due at sale`,
      };
    }

    case "deferred":
    default:
      return {
        dueAtSale: amount,
        forgiven: 0,
        explanation: `Deferred · ${money(amount)} due at sale`,
      };
  }
}
