import {
  type CompReview,
  COMP_REVIEW_COUNTS,
  COMP_REVIEW_LABELS,
  isSkipped,
} from "./types";

/**
 * The words and rules around answering a comp: what the Status button says,
 * what the save button says, and which swipes are refused while the answers
 * are open.
 *
 * The card used to save on the tap and swap in the next house in the same
 * instant, so the answer was never on screen and a tap looked like it had done
 * nothing. Now the tap marks the answer, the button shows it, and a separate
 * save moves on.
 */

/** Green counts, amber leaves the house out, grey is undecided. */
export type ReviewTone = "good" | "warn" | "neutral";

export function reviewTone(review: CompReview): ReviewTone {
  if (review === COMP_REVIEW_COUNTS) return "good";
  return isSkipped(review) ? "warn" : "neutral";
}

/** An answer as it reads on a button or inside a sentence: no full stop of its own. */
function answerWords(review: CompReview): string {
  return COMP_REVIEW_LABELS[review].replace(/\.$/, "");
}

export interface StatusButtonText {
  label: string;
  /** Shown under an answer, so the button reads as changeable rather than done. */
  hint: string | null;
}

/**
 * What the Status button says: "Status" until an answer is picked, then the
 * answer. It kept saying "Status" after a pick, so there was no telling what
 * had been chosen.
 */
export function statusButtonText(picked: CompReview | null): StatusButtonText {
  if (picked === null || picked === "needs_review") return { label: "Status", hint: null };
  return { label: answerWords(picked), hint: "Tap to change" };
}

/** Where this house sits in the queue: "3 of 7". */
export interface QueuePosition {
  index: number;
  total: number;
}

function isLastHouse(position: QueuePosition): boolean {
  return position.index >= position.total;
}

/** The last house finishes the job; any other moves on to the next. */
export function saveButtonLabel(position: QueuePosition): string {
  return isLastHouse(position) ? "Save and finish" : "Save and next";
}

/** Under a save that is waiting for an answer, so the greyed button says why. */
export function saveHint(position: QueuePosition): string {
  return isLastHouse(position)
    ? "Pick an answer to save this house and finish."
    : "Pick an answer to save this house and move to the next.";
}

/** Under a checked house once its answer is changed, so the change is confirmed. */
export function changedLine(review: CompReview): string {
  return `Changed to ${answerWords(review)}.`;
}

/** What the scroll guard knows about one finger move. */
export interface SwipeCheck {
  /** Whether the finger is on the sheet's own scrolling list. */
  insideScrollArea: boolean;
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
  /** How far the finger moved since the last move. Negative is up. */
  fingerDeltaY: number;
}

/**
 * Whether a swipe is refused while the answers are open.
 *
 * iPhone Safari hands any swipe the sheet cannot use to the page behind it,
 * and no overflow setting stops that, so the move itself is refused. Only a
 * swipe the sheet's list can still take goes through: a finger moving up needs
 * more list below, and a finger moving down needs list above.
 */
export function shouldRefuseSwipe(check: SwipeCheck): boolean {
  if (!check.insideScrollArea) return true;
  if (check.fingerDeltaY === 0) return false;
  const maxScroll = check.scrollHeight - check.clientHeight;
  // A sub-pixel remainder is not room to scroll.
  if (check.fingerDeltaY < 0) return check.scrollTop >= maxScroll - 1;
  return check.scrollTop <= 0;
}
