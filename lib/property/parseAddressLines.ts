/**
 * Parse pasted lines into houses.
 *
 * Format, one per line, everything after the address optional:
 *
 *   128 Maple St, Duluth GA 30096, 250000, https://…
 *
 * Deliberately forgiving about order and punctuation, because the realistic
 * input is a paste from an email or a text message rather than something typed
 * into a form. What it must never do is guess an address: a wrong house is
 * worse than a rejected line, so anything unparseable comes back as an error
 * carrying the original text for the user to fix.
 */

export interface ParsedAddressLine {
  /** 1-based, so an error message can name the line the user sees. */
  lineNumber: number;
  raw: string;
  addressLine1: string;
  city: string | null;
  state: string | null;
  zip: string | null;
  price: number | null;
  listingUrl: string | null;
}

export interface ParseError {
  lineNumber: number;
  raw: string;
  message: string;
}

export interface ParseResult {
  houses: ParsedAddressLine[];
  errors: ParseError[];
  /** Lines that repeat an address already in the same paste. */
  duplicates: ParseError[];
}

const STATE_ZIP = /\b([A-Za-z]{2})\s*,?\s*(\d{5})(?:-\d{4})?\s*$/;
const ZIP_ONLY = /\b(\d{5})(?:-\d{4})?\s*$/;

function isUrl(part: string): boolean {
  return /^https?:\/\//i.test(part.trim());
}

/**
 * A price, from something a person actually typed: 250000, $250,000, 250k.
 * Returns null rather than guessing — an unparseable number must not silently
 * become a price the verdicts then judge.
 */
export function parsePrice(part: string): number | null {
  const cleaned = part.trim().replace(/[$,\s]/g, "");
  if (!cleaned) return null;

  const thousands = /^(\d+(?:\.\d+)?)k$/i.exec(cleaned);
  if (thousands) {
    const value = Number(thousands[1]) * 1_000;
    return Number.isFinite(value) && value > 0 ? value : null;
  }

  if (!/^\d+(?:\.\d+)?$/.test(cleaned)) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) && value > 0 ? value : null;
}

/**
 * Split the address remainder into city, state and zip.
 *
 * Handles "Duluth GA 30096", "Duluth, GA 30096" and a bare "Duluth". A missing
 * state or zip is left null rather than inferred — the property's own state
 * default takes over, and RentCast is given what we actually know.
 */
function splitLocality(text: string): { city: string | null; state: string | null; zip: string | null } {
  const trimmed = text.trim().replace(/,\s*$/, "");
  if (!trimmed) return { city: null, state: null, zip: null };

  const withState = STATE_ZIP.exec(trimmed);
  if (withState) {
    const city = trimmed.slice(0, withState.index).replace(/,\s*$/, "").trim();
    return {
      city: city || null,
      state: withState[1].toUpperCase(),
      zip: withState[2],
    };
  }

  const zipOnly = ZIP_ONLY.exec(trimmed);
  if (zipOnly) {
    const city = trimmed.slice(0, zipOnly.index).replace(/,\s*$/, "").trim();
    return { city: city || null, state: null, zip: zipOnly[1] };
  }

  return { city: trimmed, state: null, zip: null };
}

/** A street line has to start with a number to be an address at all. */
function looksLikeStreet(part: string): boolean {
  return /^\s*\d/.test(part);
}

export function parseAddressLines(input: string): ParseResult {
  const houses: ParsedAddressLine[] = [];
  const errors: ParseError[] = [];
  const duplicates: ParseError[] = [];
  const seen = new Set<string>();

  const lines = input.split(/\r?\n/);

  lines.forEach((raw, index) => {
    const lineNumber = index + 1;
    const line = raw.trim();
    if (!line) return;

    // Commas inside a number belong to the number, not to the line's fields.
    // Splitting "$312,500" on commas turns it into "$312" and "500", and the
    // "500" then looks like a believable price. Removed before the split, and
    // only where a comma sits between a digit and exactly three more digits —
    // so "Duluth, GA" and "30096, 250000" (which has a space) are untouched.
    const parts = line
      .replace(/(\d),(?=\d{3}(?:\D|$))/g, "$1")
      .split(",")
      .map((p) => p.trim());

    // Pull the optional trailing fields out, right to left.
    //
    // The hard case is that a bare 5-digit number is both a valid ZIP and a
    // valid price. "44 Oak Ave, Duluth, GA, 30096" ends in a ZIP;
    // "128 Maple St, Duluth GA 30096, 250000" ends in a price. The rule that
    // separates them: a trailing number is a price only if a ZIP has already
    // been seen earlier in the line, or the number is explicitly marked as
    // money with a $, a comma or a k.
    let listingUrl: string | null = null;
    let price: number | null = null;

    for (let i = parts.length - 1; i >= 1; i--) {
      const part = parts[i];
      if (!part) {
        parts.splice(i, 1);
        continue;
      }

      if (listingUrl === null && isUrl(part)) {
        listingUrl = part;
        parts.splice(i, 1);
        continue;
      }

      if (price === null) {
        const candidate = parsePrice(part);
        if (candidate !== null) {
          const marked = /[$k,]/i.test(part);
          const zipEarlier = parts.slice(0, i).some((p) => ZIP_ONLY.test(p));
          if (marked || zipEarlier) {
            price = candidate;
            parts.splice(i, 1);
            continue;
          }
        }
      }

      // Anything else is part of the address, and so is everything before it.
      break;
    }

    const street = parts[0] ?? "";
    if (!street) {
      errors.push({ lineNumber, raw: line, message: "No address on this line" });
      return;
    }
    if (!looksLikeStreet(street)) {
      errors.push({
        lineNumber,
        raw: line,
        message: "Doesn't start with a street number",
      });
      return;
    }

    const locality = splitLocality(parts.slice(1).join(", "));

    const house: ParsedAddressLine = {
      lineNumber,
      raw: line,
      addressLine1: street,
      city: locality.city,
      state: locality.state,
      zip: locality.zip,
      price,
      listingUrl,
    };

    // Dedupe within the paste itself. Pasting the same house twice is a typo,
    // and sending it twice would spend two RentCast requests on one address.
    const key = [street, locality.city, locality.state, locality.zip]
      .filter(Boolean)
      .join(" ")
      .toUpperCase();

    if (seen.has(key)) {
      duplicates.push({ lineNumber, raw: line, message: "Already on an earlier line" });
      return;
    }
    seen.add(key);

    houses.push(house);
  });

  return { houses, errors, duplicates };
}
