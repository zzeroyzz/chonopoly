/**
 * Parse pasted lines into houses.
 *
 * Format, one per line, everything after the address optional:
 *
 *   128 Maple St, Duluth GA 30096, 250000, https://…
 *
 * Deliberately forgiving about order and punctuation, because the realistic
 * input is a paste from an email, a text message, Google Maps, Zillow or a
 * spreadsheet rather than something typed into a form: commas or none, a
 * trailing "USA", a state spelled out, a tab before the price, or the street
 * on one line and the city on the next. What it must never do is guess an address: a wrong house is
 * worse than a rejected line, so anything unparseable comes back as an error
 * carrying the original text for the user to fix.
 */

import { STATE_FULL_NAMES, isDirectional, isStreetSuffix, stateAbbreviation } from "./address";

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

const COUNTRY_SUFFIX = /,?\s*(?:USA|U\.S\.A\.|United States(?: of America)?|US)\s*$/i;

/**
 * Bring the shapes people paste into the one this parser reads.
 *
 * A tab is a field break, as a comma is — a spreadsheet row arrives that way.
 * A trailing country is dropped: Google and Zillow both add one. A state
 * spelled out before the ZIP becomes its two letters, so "Atlanta, Georgia
 * 30345" reads like "Atlanta, GA 30345".
 */
function normalizeLine(line: string): string {
  let text = line.replace(/\t+/g, ", ").replace(COUNTRY_SUFFIX, "").trim();
  for (const name of STATE_FULL_NAMES) {
    const spelled = new RegExp(`\\b${name.replace(/ /g, "\\s+")}\\s*,?\\s*(\\d{5}(?:-\\d{4})?)`, "i");
    const match = spelled.exec(text);
    if (match) {
      text = `${text.slice(0, match.index)}${stateAbbreviation(name)} ${match[1]}${text.slice(match.index + match[0].length)}`;
      break;
    }
  }
  return text;
}

/**
 * Split an address written without commas — "2012 Shalimar Dr NE Atlanta GA
 * 30345" — into street and the rest.
 *
 * The street ends at its last suffix (Dr, St, Way…), plus an abbreviated
 * direction after it if there is one (NE). Null when there is no suffix to cut at, or nothing
 * after it: a guess at where a city starts with nothing to go on would make up
 * an address, and the line is left whole instead.
 */
function splitUncommaedStreet(text: string): [string, string] | null {
  if (!STATE_ZIP.test(text)) return null;
  const tokens = text.trim().split(/\s+/);

  let end = -1;
  // The state and ZIP are the last two tokens, so the suffix is before them.
  for (let i = tokens.length - 3; i >= 1; i--) {
    if (isStreetSuffix(tokens[i])) {
      end = i;
      break;
    }
  }
  if (end < 0) return null;
  // Only an abbreviated direction (NE, SW) is taken as the street's: a spelled
  // one more likely starts the city, as in "North Augusta".
  const after = tokens[end + 1];
  if (end + 1 < tokens.length - 2 && after.replace(/\./g, "").length <= 2 && isDirectional(after)) {
    end += 1;
  }

  const street = tokens.slice(0, end + 1).join(" ");
  const rest = tokens.slice(end + 1).join(" ");
  // Nothing between the street and the state means there is no city to find.
  if (!rest || STATE_ZIP.exec(rest)?.index === 0) return null;
  return [street, rest];
}

/** A line that is only "City, ST 12345" — the second line of a Zillow header. */
function isLocalityOnly(line: string): boolean {
  return !looksLikeStreet(line) && STATE_ZIP.test(normalizeLine(line));
}

/**
 * Join a street line with the locality line under it, so the two-line form a
 * listing page shows reads as one address. Only when the street line has no
 * ZIP of its own — two complete addresses on two lines stay two houses.
 */
function joinSplitAddresses(lines: string[]): { text: string; lineNumber: number }[] {
  const joined: { text: string; lineNumber: number }[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const next = lines[i + 1]?.trim() ?? "";
    if (looksLikeStreet(line) && !ZIP_ONLY.test(normalizeLine(line)) && next && isLocalityOnly(next)) {
      joined.push({ text: `${line}, ${next}`, lineNumber: i + 1 });
      i += 1;
      continue;
    }
    joined.push({ text: lines[i], lineNumber: i + 1 });
  }
  return joined;
}

export function parseAddressLines(input: string): ParseResult {
  const houses: ParsedAddressLine[] = [];
  const errors: ParseError[] = [];
  const duplicates: ParseError[] = [];
  const seen = new Set<string>();

  const lines = joinSplitAddresses(input.split(/\r?\n/));

  lines.forEach(({ text, lineNumber }) => {
    const line = normalizeLine(text);
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

    // No commas at all: find where the street ends from its suffix.
    if (parts.length === 1) {
      const split = splitUncommaedStreet(parts[0]);
      if (split) parts.splice(0, 1, ...split);
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

export interface OneAddress {
  addressLine1: string;
  city: string | null;
  state: string | null;
  zip: string | null;
}

/**
 * One address pasted into the street field, split into its parts.
 *
 * Null unless the paste is exactly one address carrying more than a street —
 * a bare "128 Maple St" pastes as typed, since there is nothing to fill. The
 * same parser as batch add, so the two cannot read an address differently.
 */
export function parseOneAddress(text: string): OneAddress | null {
  const { houses, errors } = parseAddressLines(text);
  if (houses.length !== 1 || errors.length > 0) return null;

  const [house] = houses;
  if (!house.city && !house.state && !house.zip) return null;
  return {
    addressLine1: house.addressLine1,
    city: house.city,
    state: house.state,
    zip: house.zip,
  };
}

export interface AddressFields {
  address_line1: string;
  city: string;
  state: string;
  zip: string;
}

/**
 * The Add form after a paste: the street from the paste, and the city, state
 * and ZIP filled only where nothing was typed. A correction someone made
 * before pasting survives it. The form's own default state counts as not
 * typed, or a pasted Florida address would keep "GA".
 */
export function fillFromPaste(
  current: AddressFields,
  pasted: OneAddress,
  defaultState: string
): AddressFields {
  const blank = (value: string) => value.trim() === "";
  return {
    address_line1: pasted.addressLine1,
    city: blank(current.city) && pasted.city ? pasted.city : current.city,
    state:
      (blank(current.state) || current.state === defaultState) && pasted.state
        ? pasted.state
        : current.state,
    zip: blank(current.zip) && pasted.zip ? pasted.zip : current.zip,
  };
}
