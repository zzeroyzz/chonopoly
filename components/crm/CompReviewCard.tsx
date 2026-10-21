"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Check, ChevronUp } from "lucide-react";
import { dollars } from "@/components/mortgage/format";
import {
  type Comp,
  type CompReview,
  COMP_REVIEW_LABELS,
  COMP_STATUS_LABELS,
  compReviewOptions,
} from "@/lib/comps/types";
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
  renovated_use: "Goes into your resale price.",
  not_renovated_skip: "Stays out: it sold tired, so it says nothing about your finished house.",
  took_off_market_skip: "Stays out: there was no sale, so there is no price to use.",
  not_comparable_skip: "Stays out: wrong size, wrong street, or the wrong kind of house.",
};

/** Why this house is or is not in the number, before any answer is given. */
const STATUS_MEANING: Record<string, string> = {
  active: "Still on the market, so this is an ask, not a sale. It isn't in your resale price.",
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
export const STATUS_STYLE: Record<string, string> = {
  sold: "bg-(--color-accent) text-(--color-base) border-transparent",
  removed: "text-amber-300 border-amber-400/50 bg-amber-500/10",
  active: "text-sky-300 border-sky-400/50 bg-sky-500/10",
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
  position: { index: number; total: number };
  onReview: (comp: Comp, review: CompReview, sale?: { price: number; date: string | null }) => void;
  onLater: () => void;
}) {
  const [sheetOpen, setSheetOpen] = useState(false);
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

  function answer(review: CompReview) {
    setSheetOpen(false);
    // Approving a removed listing is a claim that it sold, so it needs the
    // figure it sold for: the route rejects the pair without one, and so does
    // the database. Everything else saves on the tap.
    if (review === "renovated_use" && comp.status === "removed") {
      setPendingSale(true);
      return;
    }
    onReview(comp, review);
  }

  return (
    <div
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
              rounded-(--radius-pill) border ${STATUS_STYLE[comp.status] ?? STATUS_STYLE.active}`}
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

      {pendingSale ? (
        <SalePricePrompt
          comp={comp}
          onSave={(price, saleDate) => onReview(comp, "renovated_use", { price, date: saleDate })}
          onCancel={() => setPendingSale(false)}
        />
      ) : (
        <div className="flex gap-2 pt-3 border-t border-(--color-border-subtle)">
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            data-testid="comp-review-answer"
            className="flex-1 min-h-11 px-4 flex items-center justify-center gap-1.5
              rounded-(--radius-pill) bg-(--color-accent) text-(--color-base)
              text-[13px] font-semibold"
          >
            Was it fixed up like yours will be?
            <ChevronUp size={14} className="shrink-0" />
          </button>
          <button
            type="button"
            onClick={onLater}
            data-testid="comp-review-later"
            className="min-h-11 px-4 rounded-(--radius-pill) border border-(--color-border-default)
              text-[13px] font-medium"
          >
            Later
          </button>
        </div>
      )}

      {sheetOpen && (
        <ReviewSheet comp={comp} onPick={answer} onClose={() => setSheetOpen(false)} />
      )}
    </div>
  );
}

/**
 * The answers, up from the bottom of the screen.
 *
 * Under the thumb, over the house rather than pushing it off screen, and gone
 * again the moment one is picked. Reuses the slide-up the wizard already
 * defines in globals.css.
 */
function ReviewSheet({
  comp,
  onPick,
  onClose,
}: {
  comp: Comp;
  onPick: (review: CompReview) => void;
  onClose: () => void;
}) {
  const options = compReviewOptions(comp.status).filter((key) => key !== "needs_review");

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    // The sheet scrolls, the page behind it must not.
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <button
        type="button"
        aria-label="Close without answering"
        onClick={onClose}
        className="absolute inset-0 bg-black/50"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Was it fixed up like yours will be?"
        data-testid="comp-review-sheet"
        className="relative wizard-slide-up bg-(--color-elevated) border-t border-(--color-border-strong)
          rounded-t-(--radius-xl) p-4 pb-8 flex flex-col gap-3 max-h-[80vh] overflow-y-auto"
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
              aria-checked={comp.review === key}
              onClick={() => onPick(key)}
              data-testid={`comp-review-choice-${key}`}
              className="w-full min-h-11 flex items-start gap-3 p-3 text-left rounded-(--radius-md)
                border border-(--color-border-default) bg-(--color-base)
                hover:border-(--color-border-strong) transition-colors"
            >
              <span
                className={`mt-0.5 shrink-0 w-[18px] h-[18px] rounded-full border flex items-center justify-center ${
                  comp.review === key
                    ? "border-(--color-accent) bg-(--color-accent) text-(--color-base)"
                    : "border-(--color-border-strong)"
                }`}
              >
                {comp.review === key && <Check size={12} />}
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
  );
}
