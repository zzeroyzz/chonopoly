/**
 * Address normalization and hashing.
 *
 * This is the fallback dedupe key for properties when no parcel number is
 * available. Four write paths depend on it — the Cash Flow analysis save, the
 * CRM manual create, the PropStream import, and the public seller form — and if
 * any of them normalizes differently, dedupe silently stops working. One
 * implementation, no exceptions.
 *
 * Deliberately not a Postgres generated column: suffix and directional handling
 * doesn't belong in a column expression, and it needs to be testable.
 */

/** USPS street suffix abbreviations, common subset, mapped to canonical form. */
const SUFFIXES: Record<string, string> = {
  ALLEY: "ALY", ALY: "ALY",
  AVENUE: "AVE", AVE: "AVE", AV: "AVE",
  BOULEVARD: "BLVD", BLVD: "BLVD", BLVDS: "BLVD",
  CIRCLE: "CIR", CIR: "CIR",
  COURT: "CT", CT: "CT",
  COVE: "CV", CV: "CV",
  CRESCENT: "CRES", CRES: "CRES",
  CROSSING: "XING", XING: "XING",
  DRIVE: "DR", DR: "DR",
  EXPRESSWAY: "EXPY", EXPY: "EXPY",
  FREEWAY: "FWY", FWY: "FWY",
  GARDEN: "GDN", GDN: "GDN",
  HIGHWAY: "HWY", HWY: "HWY",
  HOLLOW: "HOLW", HOLW: "HOLW",
  JUNCTION: "JCT", JCT: "JCT",
  LANE: "LN", LN: "LN",
  LOOP: "LOOP",
  MANOR: "MNR", MNR: "MNR",
  PARKWAY: "PKWY", PKWY: "PKWY", PKY: "PKWY",
  PASS: "PASS",
  PATH: "PATH",
  PLACE: "PL", PL: "PL",
  PLAZA: "PLZ", PLZ: "PLZ",
  POINT: "PT", PT: "PT",
  RIDGE: "RDG", RDG: "RDG",
  ROAD: "RD", RD: "RD",
  ROUTE: "RTE", RTE: "RTE",
  RUN: "RUN",
  SQUARE: "SQ", SQ: "SQ",
  STREET: "ST", ST: "ST", STR: "ST",
  TERRACE: "TER", TER: "TER", TERR: "TER",
  TRAIL: "TRL", TRL: "TRL",
  TURNPIKE: "TPKE", TPKE: "TPKE",
  VIEW: "VW", VW: "VW",
  WALK: "WALK",
  WAY: "WAY", WY: "WAY",
};

/** Directional prefixes and suffixes. */
const DIRECTIONALS: Record<string, string> = {
  NORTH: "N", N: "N",
  SOUTH: "S", S: "S",
  EAST: "E", E: "E",
  WEST: "W", W: "W",
  NORTHEAST: "NE", NE: "NE",
  NORTHWEST: "NW", NW: "NW",
  SOUTHEAST: "SE", SE: "SE",
  SOUTHWEST: "SW", SW: "SW",
};

/** US states and DC by name, for addresses that spell the state out. */
const STATE_NAMES: Record<string, string> = {
  ALABAMA: "AL", ALASKA: "AK", ARIZONA: "AZ", ARKANSAS: "AR", CALIFORNIA: "CA",
  COLORADO: "CO", CONNECTICUT: "CT", DELAWARE: "DE", "DISTRICT OF COLUMBIA": "DC",
  FLORIDA: "FL", GEORGIA: "GA", HAWAII: "HI", IDAHO: "ID", ILLINOIS: "IL",
  INDIANA: "IN", IOWA: "IA", KANSAS: "KS", KENTUCKY: "KY", LOUISIANA: "LA",
  MAINE: "ME", MARYLAND: "MD", MASSACHUSETTS: "MA", MICHIGAN: "MI", MINNESOTA: "MN",
  MISSISSIPPI: "MS", MISSOURI: "MO", MONTANA: "MT", NEBRASKA: "NE", NEVADA: "NV",
  "NEW HAMPSHIRE": "NH", "NEW JERSEY": "NJ", "NEW MEXICO": "NM", "NEW YORK": "NY",
  "NORTH CAROLINA": "NC", "NORTH DAKOTA": "ND", OHIO: "OH", OKLAHOMA: "OK",
  OREGON: "OR", PENNSYLVANIA: "PA", "RHODE ISLAND": "RI", "SOUTH CAROLINA": "SC",
  "SOUTH DAKOTA": "SD", TENNESSEE: "TN", TEXAS: "TX", UTAH: "UT", VERMONT: "VT",
  VIRGINIA: "VA", WASHINGTON: "WA", "WEST VIRGINIA": "WV", WISCONSIN: "WI",
  WYOMING: "WY",
};

/** "Georgia" → "GA". Null for anything that is not a state's full name. */
export function stateAbbreviation(name: string): string | null {
  return STATE_NAMES[name.trim().replace(/\s+/g, " ").toUpperCase()] ?? null;
}

/** Every full state name, longest first, so "West Virginia" wins over "Virginia". */
export const STATE_FULL_NAMES: string[] = Object.keys(STATE_NAMES).sort(
  (a, b) => b.length - a.length
);

/** "Dr", "Drive", "St." — a word that ends the street part of an address. */
export function isStreetSuffix(token: string): boolean {
  return token.replace(/\./g, "").toUpperCase() in SUFFIXES;
}

/** "NE", "North" — a direction that can follow the street suffix. */
export function isDirectional(token: string): boolean {
  return token.replace(/\./g, "").toUpperCase() in DIRECTIONALS;
}

/**
 * Unit designators. The unit is KEPT — apartment 2 and apartment 3 are different
 * properties — but the designator itself is canonicalized so "#2", "APT 2" and
 * "UNIT 2" collapse to the same thing.
 */
const UNIT_DESIGNATORS = new Set([
  "APT", "APARTMENT", "UNIT", "STE", "SUITE", "BLDG", "BUILDING",
  "FL", "FLOOR", "RM", "ROOM", "TRLR", "LOT", "SPC", "SPACE", "#",
]);

export interface AddressParts {
  addressLine1: string;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
}

/**
 * Fold accents and other diacritics to their base letters.
 *
 * Must run BEFORE the character filter in `normalizeStreet`, and that order is
 * the whole point. The filter strips anything outside A-Z0-9, so an accented
 * letter was being deleted rather than folded: "ŚW" became " W" while "SW"
 * stayed "SW", and the two addresses stopped matching. A real pair of rows in
 * production — "1653 sylvan rd sw" and "1653 sylvan rd św" — hashed
 * differently and became two houses.
 *
 * NFD splits a precomposed character into its base letter plus a combining
 * mark; removing the marks leaves the letter. Handles the Latin-1 and Latin
 * Extended-A ranges, which is what a mistyped US address actually produces.
 */
export function foldDiacritics(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    // A few letters carry their stroke inside the code point and have no
    // combining form to strip, so NFD leaves them whole.
    .replace(/[\u0141]/g, "L")
    .replace(/[\u0142]/g, "l")
    .replace(/[\u00d8]/g, "O")
    .replace(/[\u00f8]/g, "o")
    .replace(/[\u00c6]/g, "AE")
    .replace(/[\u00e6]/g, "ae")
    .replace(/[\u00d0\u0110]/g, "D")
    .replace(/[\u00f0\u0111]/g, "d")
    .replace(/[\u00de]/g, "TH")
    .replace(/[\u00fe]/g, "th")
    .replace(/[\u00df]/g, "ss");
}

function canonicalToken(token: string): string {
  if (SUFFIXES[token]) return SUFFIXES[token];
  if (DIRECTIONALS[token]) return DIRECTIONALS[token];
  return token;
}

/** "123 N. Main Street, Apt #4" -> "123 N MAIN ST UNIT 4" */
export function normalizeStreet(line: string): string {
  const cleaned = foldDiacritics(line)
    .toUpperCase()
    // "#4" and "# 4" both become "UNIT 4"
    .replace(/#\s*/g, " UNIT ")
    .replace(/[.,]/g, " ")
    .replace(/[^A-Z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) return "";

  const out: string[] = [];
  for (const raw of cleaned.split(" ")) {
    if (!raw) continue;
    if (UNIT_DESIGNATORS.has(raw)) {
      out.push("UNIT");
      continue;
    }
    out.push(canonicalToken(raw));
  }

  // Collapse a repeated UNIT introduced by "#" plus an explicit designator,
  // e.g. "APT #4" -> "UNIT UNIT 4".
  return out.filter((t, i) => !(t === "UNIT" && out[i - 1] === "UNIT")).join(" ");
}

/** Canonical single-line form used for both hashing and display of a match. */
export function normalizeAddress(parts: AddressParts): string {
  const street = normalizeStreet(parts.addressLine1 ?? "");
  const city = foldDiacritics(parts.city ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const state = foldDiacritics(parts.state ?? "").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 2);
  // ZIP+4 collapses to the 5-digit ZIP: the same house is often written both ways.
  const zip = (parts.zip ?? "").replace(/[^0-9]/g, "").slice(0, 5);

  return [street, city, state, zip].filter(Boolean).join(" ");
}

/** FNV-1a, 32-bit, with a caller-supplied offset basis. */
function fnv1a32(input: string, basis: number): number {
  let hash = basis;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    // 16777619, via imul so the multiply stays in 32-bit range.
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * 64-bit hex dedupe key, built from two 32-bit FNV-1a passes with different
 * offset bases. Deterministic across server and client, no crypto dependency,
 * and no BigInt — the repo's TS target predates BigInt literals.
 *
 * This is a dedupe key, not a security primitive.
 */
export function addressHash(parts: AddressParts): string {
  const input = normalizeAddress(parts);
  const a = fnv1a32(input, 0x811c9dc5);
  const b = fnv1a32(input, 0x9e3779b9);
  return a.toString(16).padStart(8, "0") + b.toString(16).padStart(8, "0");
}
