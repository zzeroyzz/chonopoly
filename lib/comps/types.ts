/**
 * A comparable sale or listing, in our shape rather than RentCast's.
 *
 * Mirrors the `property_comps` table. Nothing here is optional-because-the-API-
 * might-not-send-it; the mapper has already decided what each field is.
 */

/**
 * What we actually know about this comp's fate.
 *
 * `removed` exists because RentCast reports only Active/Inactive, and an
 * inactive listing might have sold or might have been withdrawn — the API does
 * not say which. Collapsing `removed` into `sold` would be the single easiest
 * way to inflate an ARV, so the two stay apart and the database enforces it:
 * `sold` requires `source = 'manual'`, because only a person can confirm a sale.
 */
export type CompStatus = "active" | "pending" | "removed" | "sold";

/**
 * Whether this status can be judged at all.
 *
 * An active listing is an asking price and a pending one is an accepted offer
 * that has not closed. Neither is evidence of what a finished house sells for,
 * so neither is reviewed and neither counts. They are context, not a chore.
 *
 * One definition because four call sites drifting apart is how "active comps
 * are not counted" became true of the screen and false of the arithmetic.
 */
export function isReviewable(status: CompStatus): boolean {
  return status === "removed" || status === "sold";
}

/**
 * Where a comp came from, which decides whether it may claim a sale.
 *
 * `public_record` is a county deed: somebody paid this, on this date. It can
 * assert `sold` for the same reason `manual` can — it is evidence rather than
 * an opinion — and the database CHECK enforces that `rentcast` never can.
 */
export type CompSource = "rentcast" | "manual" | "public_record";

/**
 * Whether this comp counts, and why not.
 *
 * Only `renovated_use` counts. The app never sets anything but the
 * `needs_review` default — the whole point is that the number stops moving
 * unless a person moves it.
 *
 * The two skips are arithmetically identical and deliberately separate: they
 * record different judgements, and "why isn't this one in?" has two different
 * answers.
 */
export type CompReview =
  | "needs_review"
  | "renovated_use"
  | "not_renovated_skip"
  | "took_off_market_skip"
  | "not_comparable_skip"
  | "cant_tell_skip";

export const COMP_REVIEW_LABELS: Record<CompReview, string> = {
  needs_review: "Needs review",
  renovated_use: "Renovated",
  not_renovated_skip: "Not renovated",
  took_off_market_skip: "Took off market",
  not_comparable_skip: "Not comparable",
  // Says what it does as well as what it is: the resale price is the thing
  // the owner is deciding about, and "can't tell" alone does not say that it
  // moves out of the number.
  cant_tell_skip: "Photos are gone, can't tell.",
};

/**
 * The options a comp can be given, which depend on what it is.
 *
 * Only a removed listing can have been taken off the market — a recorded
 * sale closed and an active listing has not finished yet, so offering it
 * there would be offering an answer that cannot be true.
 */
export function compReviewOptions(status: CompStatus, review: CompReview): CompReview[] {
  // An unreviewable status has nothing to answer — unless somebody already
  // answered it. Returning nothing for a comp that is already approved would
  // leave it counting with no control to change it: unreachable and live at
  // the same time.
  if (!isReviewable(status) && review === "needs_review") return [];

  return status === "removed"
    ? [
        "needs_review",
        "renovated_use",
        "not_renovated_skip",
        "took_off_market_skip",
        // Only a removed listing can have lost its photos in a way that
        // matters: an active one still has its listing up.
        "cant_tell_skip",
        "not_comparable_skip",
      ]
    : ["needs_review", "renovated_use", "not_renovated_skip", "not_comparable_skip"];
}

/** Every value, for validation at the API boundary. */
export const COMP_REVIEW_ORDER: CompReview[] = [
  "needs_review",
  "renovated_use",
  "not_renovated_skip",
  "took_off_market_skip",
  "not_comparable_skip",
  "cant_tell_skip",
];

/** The one state that puts a comp in the number. */
export const COMP_REVIEW_COUNTS: CompReview = "renovated_use";

/**
 * Every state that means "looked at, and left out".
 *
 * Derived from the order rather than listed, because listing it is what broke:
 * two separate hardcoded arrays both missed `took_off_market_skip` when it was
 * added, so a comp marked that way matched no filter but All and kept showing
 * hints about a question already settled. A sixth state cannot repeat that.
 */
export const COMP_REVIEW_SKIPS: CompReview[] = COMP_REVIEW_ORDER.filter(
  (review) => review !== "needs_review" && review !== COMP_REVIEW_COUNTS
);

/** Whether this review means the comp was looked at and left out. */
export function isSkipped(review: CompReview): boolean {
  return COMP_REVIEW_SKIPS.includes(review);
}

export interface Comp {
  id: string;
  propertyId: string;
  source: CompSource;
  /** RentCast's comparable id. Null for hand-entered comps. */
  externalId: string | null;

  formattedAddress: string;
  city: string | null;
  state: string | null;
  zip: string | null;
  latitude: number | null;
  longitude: number | null;

  propertyType: string | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  lotSqft: number | null;
  yearBuilt: number | null;

  price: number | null;
  status: CompStatus;
  listingType: string | null;
  listedDate: string | null;
  removedDate: string | null;
  lastSeenDate: string | null;
  daysOnMarket: number | null;
  distanceMiles: number | null;
  daysOld: number | null;
  correlation: number | null;

  /**
   * Who bought it, per public records, and which county said so. Only a
   * `public_record` comp has these; they drive the fixer-upper note.
   */
  buyerType: string | null;
  buyerName: string | null;
  county: string | null;

  /**
   * Dead. The ARV reads `review` instead. Kept on the row so the old tick
   * state is not lost, and read here only so nothing that still references
   * it breaks.
   */
  included: boolean;

  /** The owner's judgement. The only thing the ARV reads. */
  review: CompReview;
  reviewSetAt: string | null;

  /**
   * What the owner saw when they reviewed it.
   *
   * Its own column, beside `notes`: that one carries a hand-entered comp's
   * listing URL and the card reads it as one.
   */
  reviewNotes: string | null;

  /**
   * What the owner says a removed listing actually sold for, and when.
   *
   * Beside `price`, never instead of it: `price` is what was asked, this is
   * what was paid, and the card shows both. The ARV uses this when it is set.
   */
  salePrice: number | null;
  saleDate: string | null;
  notes: string | null;

  updatedAt: string;
}

/** What the user can type in by hand. Everything else is derived or defaulted. */
export interface ManualCompInput {
  formattedAddress: string;
  price: number;
  sqft: number | null;
  beds: number | null;
  baths: number | null;
  yearBuilt: number | null;
  /**
   * Defaults to "sold" at the call site: a comp someone typed in from an
   * agent's list is a closed sale, which is exactly the evidence RentCast
   * cannot provide.
   */
  status: CompStatus;
  /**
   * When it sold, as "YYYY-MM-DD". Stored in `removed_date`, which for a
   * confirmed sale is exactly what it means — the date the house left the
   * market. Optional, because an agent's list does not always carry it, and a
   * comp with no date is more useful than no comp.
   */
  saleDate: string | null;
  notes: string | null;
}

/** Every status, for validation at the API boundary. */
export const COMP_STATUS_ORDER: CompStatus[] = ["active", "pending", "removed", "sold"];

export const COMP_STATUS_LABELS: Record<CompStatus, string> = {
  active: "Active",
  // An accepted offer that has not closed. Only a person can say so: RentCast
  // reports Active or Inactive and nothing else.
  pending: "Pending",
  // Not "Inactive", which says nothing, and emphatically not "Sold".
  removed: "Removed",
  sold: "Sold",
};
