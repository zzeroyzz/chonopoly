"use client";

import { type RefObject, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, Check, ChevronUp } from "lucide-react";
import { dollars } from "@/components/mortgage/format";
import {
  type Comp,
  type CompReview,
  type CompStatus,
  COMP_REVIEW_LABELS,
  COMP_STATUS_LABELS,
  compReviewOptions,
  needsSalePrice,
} from "@/lib/comps/types";
import {
  type QueuePosition,
  type ReviewTone,
  reviewTone,
  saveButtonLabel,
  saveHint,
  shouldRefuseSwipe,
  statusButtonText,
} from "@/lib/comps/reviewAnswer";
import { type CompNote } from "@/lib/comps/arv";
import {
  comparedToSubject,
  compDate,
  perSqft,
  priceLabel,
  provenanceLabel,
  type SubjectFacts,
} from "@/lib/comps/format";
import { CompLinks } from "./CompLinks";
import { SalePricePrompt } from "./SalePricePrompt";

/**
 * One house, filling the screen.
 *
 * The tab was a scrolling stack of eleven of these at equal weight, and the
 * work happens in another app: you tap out to Zillow, look at the photos,
 * come back. Eleven identical cards is the worst possible thing to come back
 * to, so there is one.
 *
 * It holds everything the decision needs — address, what it sold for, when,
 * how far, size, year, the links — because the thing you would scroll past is
 * the thing you are comparing against.
 *
 * The answers live in a sheet rather than on the card. Five options with a
 * line of consequence each is a lot of height for something touched once per
 * house, and the height belongs to the house.
 *
 * Picking an answer only marks it. The Status button then shows it, and
 * nothing is saved until Save and next.
 */

/**
 * What each answer does to the number.
 *
 * `COMP_REVIEW_LABELS` names the answer; this says what picking it means. A
 * row that is only a label makes the owner guess at the consequence, and the
 * consequence is the entire decision.
 */
const REVIEW_CONSEQUENCE: Record<CompReview, string> = {
  needs_review: "Leaves it undecided.",
  cant_tell_skip:
    "Stays out, and your resale price will say how many you couldn't judge.",
  renovated_use: "Goes into your resale price.",
  not_renovated_skip: "Stays out: it sold tired, so it says nothing about your finished house.",
  took_off_market_skip: "Stays out: there was no sale, so there is no price to use.",
  not_comparable_skip: "Stays out: wrong size, wrong street, or the wrong kind of house.",
};

/**
 * Why this house is or is not in the number, before any answer is given.
 *
 * `Record<CompStatus, …>`, not `Record<string, …>`. It was the loose one, and
 * a new status would have rendered the sentence as `undefined` with a clean
 * build. The compiler holds this now.
 */
const STATUS_MEANING: Record<CompStatus, string> = {
  active: "Still on the market, so this is an ask, not a sale. It isn't in your resale price.",
  pending: "Under contract. The price isn't final, so it isn't in your resale price yet.",
  removed: "It left the market. Nobody knows yet whether it sold or the owner gave up.",
  sold: "It closed at this price. This is the kind of house your resale price is built from.",
};

/**
 * Each status gets its own ink and an edge.
 *
 * Active was elevated-on-elevated with secondary text, which on this card is
 * a grey word on a grey patch — the one piece of the header that says whether
 * the price in front of it is a sale or an opinion.
 */
export const STATUS_STYLE: Record<CompStatus, string> = {
  sold: "bg-(--color-accent) text-(--color-base) border-transparent",
  removed: "text-amber-300 border-amber-400/50 bg-amber-500/10",
  active: "text-sky-300 border-sky-400/50 bg-sky-500/10",
  // Its own ink. Pending inheriting the Active pill is the exact defect the
  // loose Record above let through.
  pending: "text-violet-300 border-violet-400/50 bg-violet-500/10",
};

export function CompReviewCard({
  comp,
  note,
  subject,
  position,
  onReview,
  onLater,
}: {
  comp: Comp;
  note: CompNote | undefined;
  /** The house being bought, so the card can say how this one differs. */
  subject: SubjectFacts;
  /** "3 of 7". A review you cannot see the end of is one nobody finishes. */
  position: QueuePosition;
  onReview: (
    comp: Comp,
    review: CompReview,
    extra?: { sale?: { price: number; date: string | null }; notes?: string | null }
  ) => void;
  onLater: () => void;
}) {
  const [sheetOpen, setSheetOpen] = useState(false);
  /** The answer tapped in the sheet: on the Status button, not saved yet. */
  const [picked, setPicked] = useState<CompReview | null>(null);
  /** The card itself, so the sheet can find and still the list it sits in. */
  const cardRef = useRef<HTMLDivElement>(null);
  const [notes, setNotes] = useState(comp.reviewNotes ?? "");
  /** Set only when the answer still needs a figure before it can be saved. */
  const [pendingSale, setPendingSale] = useState(false);

  const against = comparedToSubject(comp, subject);
  const ppsf = perSqft(comp);
  const label = priceLabel(comp);
  const date = compDate(comp);
  const provenance = provenanceLabel(comp);

  const facts = [
    comp.beds === null ? null : `${comp.beds} bed`,
    comp.baths === null ? null : `${comp.baths} bath`,
    comp.sqft === null ? null : `${comp.sqft.toLocaleString("en-US")} sq ft`,
    comp.yearBuilt === null ? null : `built ${comp.yearBuilt}`,
    comp.distanceMiles === null ? null : `${comp.distanceMiles.toFixed(1)} mi away`,
    date,
    provenance,
  ].filter((part): part is string => part !== null && part !== "");

  // Marks the answer and nothing more. It used to save on the tap, which
  // swapped in the next house the same instant, so the answer was never seen.
  function pick(review: CompReview) {
    setPicked(review);
    setSheetOpen(false);
  }

  function save() {
    if (picked === null) return;
    // Approving a removed listing is a claim that it sold, so it needs the
    // figure it sold for: the route rejects the pair without one, and so does
    // the database.
    if (needsSalePrice(picked, comp.status)) {
      setPendingSale(true);
      return;
    }
    onReview(comp, picked, { notes: notes.trim() || null });
  }

  return (
    <div
      ref={cardRef}
      data-testid={`comp-review-card-${comp.id}`}
      className="rounded-(--radius-xl) border border-(--color-border-default)
        bg-(--color-elevated) p-5 flex flex-col gap-4"
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-[15px] font-semibold leading-snug wrap-break-word min-w-0">
          {comp.formattedAddress}
        </p>
        <span
          data-testid="comp-review-position"
          className="shrink-0 text-[12px] text-(--color-text-secondary)"
        >
          {position.index} of {position.total}
        </span>
      </div>

      <div className="flex flex-col gap-2.5">
        <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
          {label && <span className="text-[11px] text-(--color-text-secondary)">{label}</span>}
          <span className="text-[26px] font-bold leading-none tracking-tight">
            {comp.price === null ? "—" : dollars(comp.price)}
          </span>
          {comp.salePrice !== null && (
            <span className="text-[15px] font-semibold text-(--color-accent)">
              · Sold for {dollars(comp.salePrice)}
            </span>
          )}
          {ppsf && (
            <span className="text-[12px] text-(--color-text-secondary)">{ppsf}</span>
          )}
          <span
            className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5
              rounded-(--radius-pill) border ${STATUS_STYLE[comp.status]}`}
          >
            {COMP_STATUS_LABELS[comp.status]}
          </span>
        </div>

        {/* One quiet line of plain facts, the date among them. Four separate
            lines of the same grey was four things competing and none read. */}
        {facts.length > 0 && (
          <p className="text-[12px] text-(--color-text-secondary)">{facts.join(" · ")}</p>
        )}

        {/* The comparison is the thing the decision turns on, so it reads at
            full strength rather than as another grey aside. */}
        {against && (
          <p data-testid="comp-review-vs" className="text-[13px] leading-relaxed">
            <span className="text-(--color-text-secondary)">Next to yours: </span>
            <span className="font-medium">{against}</span>
          </p>
        )}

        {/* Whether the price above is a sale or an opinion. It gets a ground
            of its own so it reads as the note it is. */}
        <p className="text-[12px] leading-relaxed text-(--color-text-primary)
          bg-(--color-base) border border-(--color-border-subtle)
          rounded-(--radius-md) px-3 py-2">
          {STATUS_MEANING[comp.status]}
        </p>

        {note?.fixerUpper && note.reasons.length > 0 && (
          <p className="flex gap-1.5 text-[11px] text-amber-400 mt-1 leading-relaxed">
            <AlertTriangle size={12} className="shrink-0 mt-0.5" />
            {note.reasons.join(", ")}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-(--color-text-secondary)">
          Go and look at it
        </p>
        <CompLinks comp={comp} />
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-(--color-text-secondary)">
          Notes
        </span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          placeholder="new kitchen, old windows"
          data-testid="comp-review-notes"
          className="w-full bg-(--color-base) border border-(--color-border-default)
            rounded-(--radius-md) px-3 py-2 text-[16px] leading-relaxed resize-y
            focus:outline-none focus:border-(--color-accent) transition-colors"
        />
        <span className="text-[11px] text-(--color-text-secondary)">
          What you saw. Only you and your team see this.
        </span>
      </label>

      {pendingSale ? (
        <SalePricePrompt
          comp={comp}
          onSave={(price, saleDate) =>
            onReview(comp, "renovated_use", {
              sale: { price, date: saleDate },
              notes: notes.trim() || null,
            })
          }
          onCancel={() => setPendingSale(false)}
        />
      ) : (
        <div className="flex flex-col gap-2 pt-3 border-t border-(--color-border-subtle)">
          <StatusButton
            answer={picked}
            onOpen={() => setSheetOpen(true)}
            testId="comp-review-answer"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={save}
              disabled={picked === null}
              data-testid="comp-review-save"
              className="flex-1 min-h-11 px-4 rounded-(--radius-pill) bg-(--color-accent)
                text-(--color-base) text-[13px] font-semibold
                disabled:bg-(--color-overlay) disabled:text-(--color-text-tertiary)"
            >
              {saveButtonLabel(position)}
            </button>
            <button
              type="button"
              onClick={onLater}
              data-testid="comp-review-later"
              /* Notes cannot be saved on their own — the route needs a review
                 to attach them to — so Later loses them, and says so rather
                 than letting the owner find out. */
              title={notes.trim() ? "Your notes here won't be kept" : undefined}
              className="min-h-11 px-4 rounded-(--radius-pill) border border-(--color-border-default)
                text-[13px] font-medium"
            >
              Later
            </button>
          </div>
          {picked === null && (
            <p data-testid="comp-review-save-hint" className="text-[11px] text-(--color-text-secondary)">
              {saveHint(position)}
            </p>
          )}
        </div>
      )}

      {notes.trim() && (
        <p className="text-[11px] text-(--color-text-secondary) -mt-2">
          Your notes save with your answer. &ldquo;Later&rdquo; won&apos;t keep them.
        </p>
      )}

      {sheetOpen && (
        <ReviewSheet
          comp={comp}
          selected={picked}
          anchor={cardRef}
          onPick={pick}
          onClose={() => setSheetOpen(false)}
        />
      )}
    </div>
  );
}

/** Each answer's dot, by what it does to the number. */
const TONE_DOT: Record<ReviewTone, string> = {
  good: "bg-(--color-accent)",
  warn: "bg-amber-400",
  neutral: "bg-(--color-text-tertiary)",
};

/**
 * The answer, or the way to give one.
 *
 * Reads "Status" until there is an answer, then the answer in its colour, so
 * what was picked stays on screen. The review card and the Checked rows share
 * it, and the Checked rows are where a wrong answer gets put right.
 */
export function StatusButton({
  answer,
  onOpen,
  testId,
  label,
}: {
  answer: CompReview | null;
  onOpen: () => void;
  testId: string;
  /** Names the house, on a list of rows that look alike. */
  label?: string;
}) {
  const text = statusButtonText(answer);

  if (answer === null || text.hint === null) {
    return (
      <button
        type="button"
        onClick={onOpen}
        data-testid={testId}
        aria-label={label}
        className="w-full min-h-11 px-4 flex items-center justify-center gap-1.5
          rounded-(--radius-pill) bg-(--color-accent) text-(--color-base)
          text-[13px] font-semibold"
      >
        {text.label}
        <ChevronUp size={14} className="shrink-0" />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      data-testid={testId}
      aria-label={label ? `${label}: ${text.label}. ${text.hint}` : undefined}
      className="w-full min-h-11 px-4 py-1.5 flex items-center gap-2.5 text-left
        rounded-(--radius-pill) border border-(--color-border-strong) bg-(--color-base)"
    >
      <span aria-hidden className={`w-2.5 h-2.5 shrink-0 rounded-full ${TONE_DOT[reviewTone(answer)]}`} />
      <span className="flex-1 min-w-0 flex flex-col">
        <span className="text-[13px] font-semibold leading-tight">{text.label}</span>
        <span className="text-[11px] leading-tight text-(--color-text-secondary)">{text.hint}</span>
      </span>
      <ChevronUp size={14} className="shrink-0 text-(--color-text-secondary)" />
    </button>
  );
}

/**
 * The answers, up from the bottom of the screen.
 *
 * Under the thumb, over the house rather than pushing it off screen, and gone
 * again the moment one is picked. Reuses the slide-up the wizard already
 * defines in globals.css.
 */
export function ReviewSheet({
  comp,
  selected,
  anchor,
  onPick,
  onClose,
}: {
  comp: Comp;
  /** The answer ticked: the one picked on the card, or the one saved on a row. */
  selected: CompReview | null;
  /** What opened the sheet; every list it scrolls in is held still. */
  anchor: RefObject<HTMLElement | null>;
  onPick: (review: CompReview) => void;
  onClose: () => void;
}) {
  const options = compReviewOptions(comp.status, comp.review).filter(
    (key) => key !== "needs_review"
  );
  /** The sheet's own list: the one thing a swipe may move while it is open. */
  const scrollArea = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);

    // The sheet scrolls, the page behind it must not. This locked the body,
    // but the app scrolls the shell's own container, not the body, so a swipe
    // on the sheet moved the list behind it instead. Every scrolling list
    // above is held now: only the nearest was, which left the rest free.
    const held = scrollingAncestors(anchor.current).map((node) => ({
      node,
      previous: node.style.overflowY,
    }));
    for (const { node } of held) node.style.overflowY = "hidden";

    // Holding the lists was not enough on an iPhone: Safari hands a swipe the
    // sheet cannot use to the page behind it, so that swipe is refused here.
    let lastY: number | null = null;
    function onTouchStart(event: TouchEvent) {
      lastY = event.touches[0]?.clientY ?? null;
    }
    function onTouchMove(event: TouchEvent) {
      const y = event.touches[0]?.clientY;
      if (y === undefined) return;
      const area = scrollArea.current;
      const refuse = shouldRefuseSwipe({
        insideScrollArea:
          area !== null && event.target instanceof Node && area.contains(event.target),
        scrollTop: area?.scrollTop ?? 0,
        scrollHeight: area?.scrollHeight ?? 0,
        clientHeight: area?.clientHeight ?? 0,
        fingerDeltaY: lastY === null ? 0 : y - lastY,
      });
      lastY = y;
      if (refuse && event.cancelable) event.preventDefault();
    }
    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchmove", onTouchMove, { passive: false });

    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchmove", onTouchMove);
      for (const { node, previous } of held) node.style.overflowY = previous;
    };
  }, [onClose, anchor]);

  // Portalled to the body. Rendered in place, it sat inside the house page's
  // sheet, a `relative z-10` stacking context, so its z-50 only counted inside
  // that sheet and the bottom bar (z-40) painted over its last options.
  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <button
        type="button"
        aria-label="Close without answering"
        onClick={onClose}
        className="absolute inset-0 bg-black/50 touch-none"
      />

      {/* Two layers on purpose. The outer one slides up; the inner one
          scrolls. On one element, iPhone Safari kept the scrolling area's tap
          region where the slide started — off-screen — and nothing inside the
          sheet could be tapped, though it looked fine. */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Was it fixed up like yours will be?"
        data-testid="comp-review-sheet"
        className="relative sheet-slide-up bg-(--color-elevated) border-t border-(--color-border-strong)
          rounded-t-(--radius-xl) overflow-hidden"
      >
        <div
          ref={scrollArea}
          className="p-4 pb-[calc(2rem+env(safe-area-inset-bottom))] flex flex-col gap-3
            max-h-[85dvh] overflow-y-auto overscroll-contain"
        >
          <div className="flex flex-col gap-0.5">
            <p className="text-[14px] font-semibold">Was it fixed up like yours will be?</p>
            <p className="text-[11px] text-(--color-text-secondary) wrap-break-word">
              {comp.formattedAddress}
            </p>
          </div>

          <div role="radiogroup" aria-label="Was it fixed up like yours will be?" className="flex flex-col gap-1.5">
            {options.map((key) => (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={selected === key}
                onClick={() => onPick(key)}
                data-testid={`comp-review-choice-${key}`}
                className="w-full min-h-11 flex items-start gap-3 p-3 text-left rounded-(--radius-md)
                  border border-(--color-border-default) bg-(--color-base)
                  hover:border-(--color-border-strong) transition-colors"
              >
                <span
                  className={`mt-0.5 shrink-0 w-[18px] h-[18px] rounded-full border flex items-center justify-center ${
                    selected === key
                      ? "border-(--color-accent) bg-(--color-accent) text-(--color-base)"
                      : "border-(--color-border-strong)"
                  }`}
                >
                  {selected === key && <Check size={12} />}
                </span>
                <span className="flex flex-col gap-0.5 min-w-0">
                  <span className="text-[13px]">{COMP_REVIEW_LABELS[key]}</span>
                  <span className="text-[11px] text-(--color-text-secondary) leading-relaxed">
                    {REVIEW_CONSEQUENCE[key]}
                  </span>
                </span>
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={onClose}
            data-testid="comp-review-sheet-cancel"
            className="min-h-11 px-4 rounded-(--radius-pill) border border-(--color-border-default)
              text-[13px] font-medium self-start"
          >
            Not yet
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

/** Every ancestor that scrolls vertically: everything that must hold still. */
function scrollingAncestors(element: HTMLElement | null): HTMLElement[] {
  const found: HTMLElement[] = [];
  for (let node = element?.parentElement ?? null; node; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node);
    if ((overflowY === "auto" || overflowY === "scroll") && node.scrollHeight > node.clientHeight) {
      found.push(node);
    }
  }
  return found;
}
