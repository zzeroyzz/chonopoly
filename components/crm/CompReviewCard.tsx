"use client";

import { useState } from "react";
import { AlertTriangle, Check } from "lucide-react";
import { dollars } from "@/components/mortgage/format";
import {
  type Comp,
  type CompReview,
  COMP_REVIEW_LABELS,
  COMP_STATUS_LABELS,
  compReviewOptions,
} from "@/lib/comps/types";
import { type CompNote } from "@/lib/comps/arv";
import { compDate, perSqft, priceLabel, provenanceLabel } from "@/lib/comps/format";
import { CompLinks, type CompLinkSource } from "./CompLinks";
import { SalePricePrompt } from "./SalePricePrompt";

/**
 * One house, filling the screen.
 *
 * The tab was a scrolling stack of eleven of these at equal weight, and the
 * work happens in another app: you tap out to Zillow, look at the photos,
 * come back. Eleven identical cards is the worst possible thing to come back
 * to, so there is one, and it says which one it is.
 *
 * It holds everything the decision needs — address, what it sold for, when,
 * how far, size, year, the links, the choice — because the thing you would
 * scroll past is the thing you are comparing against.
 */

/**
 * What each answer does to the number.
 *
 * `COMP_REVIEW_LABELS` names the answer; this says what picking it means.
 * A row that is only a label makes the owner guess at the consequence, and
 * the consequence is the entire decision.
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

const STATUS_STYLE: Record<string, string> = {
  sold: "bg-(--color-accent-glow) text-(--color-accent)",
  removed: "bg-amber-500/10 text-amber-400",
  active: "bg-(--color-elevated) text-(--color-text-secondary)",
};

export function CompReviewCard({
  comp,
  note,
  position,
  onReview,
  onLater,
}: {
  comp: Comp;
  note: CompNote | undefined;
  /** "3 of 7". A review you cannot see the end of is one nobody finishes. */
  position: { index: number; total: number };
  onReview: (comp: Comp, review: CompReview, sale?: { price: number; date: string | null }) => void;
  onLater: () => void;
}) {
  const [choice, setChoice] = useState<CompReview | null>(null);
  const [opened, setOpened] = useState<CompLinkSource | null>(null);

  // Approving a removed listing is a claim that it sold, so it needs the
  // figure it sold for: the route rejects the pair without one, and so does
  // the database. The prompt is the same component the row uses.
  const needsSalePrice = choice === "renovated_use" && comp.status === "removed";

  const options = compReviewOptions(comp.status).filter((key) => key !== "needs_review");
  const ppsf = perSqft(comp);
  const label = priceLabel(comp);
  const date = compDate(comp);
  const provenance = provenanceLabel(comp);
  const last = position.index >= position.total;

  const specs = [
    comp.beds === null ? null : `${comp.beds} bed`,
    comp.baths === null ? null : `${comp.baths} bath`,
    comp.sqft === null ? null : `${comp.sqft.toLocaleString("en-US")} sq ft`,
    comp.yearBuilt === null ? null : `built ${comp.yearBuilt}`,
    comp.distanceMiles === null ? null : `${comp.distanceMiles.toFixed(1)} mi away`,
  ].filter((part): part is string => part !== null);

  return (
    <div
      data-testid={`comp-review-card-${comp.id}`}
      data-reviewing={opened ? "true" : undefined}
      className={`rounded-(--radius-xl) border p-5 flex flex-col gap-4 transition-colors ${
        opened
          ? "border-(--color-reviewing) bg-(--color-reviewing-tint)"
          : "border-(--color-border-default) bg-(--color-elevated)"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-[14px] font-semibold leading-snug wrap-break-word min-w-0">
          {comp.formattedAddress}
        </p>
        <span
          data-testid="comp-review-position"
          className="shrink-0 text-[12px] text-(--color-text-secondary)"
        >
          {position.index} of {position.total}
        </span>
      </div>

      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {label && <span className="text-[11px] text-(--color-text-secondary)">{label}</span>}
          <span className="text-[18px] font-bold">
            {comp.price === null ? "—" : dollars(comp.price)}
          </span>
          {comp.salePrice !== null && (
            <span className="text-[13px] font-semibold text-(--color-accent)">
              · Sold for {dollars(comp.salePrice)}
            </span>
          )}
          {ppsf && <span className="text-[11px] text-(--color-text-secondary)">{ppsf}</span>}
          <span
            className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded ${
              STATUS_STYLE[comp.status] ?? STATUS_STYLE.active
            }`}
          >
            {COMP_STATUS_LABELS[comp.status]}
          </span>
        </div>

        {specs.length > 0 && (
          <p className="text-[11px] text-(--color-text-secondary)">{specs.join(" · ")}</p>
        )}
        {(date || provenance) && (
          <p className="text-[11px] text-(--color-text-secondary)">
            {[date, provenance].filter(Boolean).join(" · ")}
          </p>
        )}
        <p className="text-[12px] text-(--color-text-secondary) leading-relaxed">
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
        <p className="text-[9px] uppercase tracking-[0.1em] text-(--color-text-secondary)">
          Go and look at it
        </p>
        <CompLinks comp={comp} opened={opened} onOpen={setOpened} />
      </div>

      {/* Colour is never the only signal: the place you are is also said. */}
      {opened && (
        <p data-testid="comp-reviewing-here" className="text-[12px] text-(--color-reviewing)">
          You&apos;re on this one — the one you just opened.
        </p>
      )}

      <div className="flex flex-col gap-2.5">
        <p className="text-[13px] font-semibold">Was it fixed up like yours will be?</p>

        <div
          role="radiogroup"
          aria-label="Was it fixed up like yours will be?"
          className="flex flex-col gap-1.5"
        >
          {options.map((key) => {
            const checked = choice === key;
            return (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={checked}
                onClick={() => setChoice(key)}
                data-testid={`comp-review-choice-${key}`}
                className={`w-full min-h-11 flex items-start gap-3 p-3 text-left rounded-(--radius-md)
                  border transition-colors ${
                    checked
                      ? "border-(--color-accent) bg-(--color-accent-glow)"
                      : "border-(--color-border-default) bg-(--color-base)"
                  }`}
              >
                <span
                  className={`mt-0.5 shrink-0 w-[18px] h-[18px] rounded-full border flex items-center justify-center ${
                    checked
                      ? "border-(--color-accent) bg-(--color-accent) text-(--color-base)"
                      : "border-(--color-border-strong)"
                  }`}
                >
                  {checked && <Check size={12} />}
                </span>
                <span className="flex flex-col gap-0.5 min-w-0">
                  <span className="text-[13px]">{COMP_REVIEW_LABELS[key]}</span>
                  <span className="text-[11px] text-(--color-text-secondary) leading-relaxed">
                    {REVIEW_CONSEQUENCE[key]}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {needsSalePrice ? (
        /* Its own Save lives inside it, so the footer's would be a second one
           asking the same question. */
        <SalePricePrompt
          comp={comp}
          onSave={(price, saleDate) =>
            onReview(comp, "renovated_use", { price, date: saleDate })
          }
          onCancel={() => setChoice(null)}
        />
      ) : (
        <div className="flex gap-2 pt-3 border-t border-(--color-border-subtle)">
          <button
            type="button"
            disabled={!choice}
            onClick={() => choice && onReview(comp, choice)}
            data-testid="comp-review-save"
            className="flex-1 min-h-11 px-4 rounded-(--radius-pill) bg-(--color-accent)
              text-(--color-base) text-[13px] font-semibold disabled:opacity-50"
          >
            {last ? "Save and finish" : "Save and next"}
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

      {/* A disabled button with no reason beside it reads as a broken app. */}
      {!choice && !needsSalePrice && (
        <p className="text-[12px] text-(--color-text-secondary)">
          Pick one above to save this house and move to the next.
        </p>
      )}
    </div>
  );
}
