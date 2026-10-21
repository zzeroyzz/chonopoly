"use client";

import { useState } from "react";
import { dollars } from "@/components/mortgage/format";
import { type Comp } from "@/lib/comps/types";

/**
 * What did it sell for?
 *
 * A removed listing has two prices and only one of them values a house. The
 * price is required — approving a removed comp without it would put an
 * asking price into the ARV, which is the whole thing this prevents. The
 * date is optional, because an agent's answer often does not carry one and a
 * sale with no date is still worth more than no sale.
 */
export function SalePricePrompt({
  comp,
  onSave,
  onCancel,
}: {
  comp: Comp;
  onSave: (price: number, date: string | null) => void;
  onCancel: () => void;
}) {
  const [price, setPrice] = useState("");
  const [date, setDate] = useState("");

  const amount = Number(price.replace(/[^0-9.]/g, ""));
  const valid = Number.isFinite(amount) && amount > 0;

  const field =
    "w-full min-h-11 bg-(--color-base) border border-(--color-border-default) rounded-lg px-3 text-[13px]";

  return (
    <div
      data-testid={`comp-sale-prompt-${comp.id}`}
      className="mt-2 rounded-lg border border-(--color-border-default) bg-(--color-base) p-3 flex flex-col gap-2"
    >
      <p className="text-[12px] leading-relaxed">
        What did it sell for?{" "}
        <span className="text-(--color-text-secondary)">
          It was listed at {comp.price === null ? "an unknown price" : dollars(comp.price)}.
        </span>
      </p>

      <input
        value={price}
        onChange={(e) => setPrice(e.target.value)}
        placeholder="Sale price"
        inputMode="numeric"
        autoFocus
        aria-label={`Sale price for ${comp.formattedAddress}`}
        data-testid={`comp-sale-price-input-${comp.id}`}
        className={field}
      />

      <label className="flex flex-col gap-1">
        <span className="text-[11px] text-(--color-text-secondary)">Sale date (optional)</span>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          data-testid={`comp-sale-date-input-${comp.id}`}
          className={field}
        />
      </label>

      <div className="flex gap-2">
        <button
          type="button"
          disabled={!valid}
          onClick={() => onSave(amount, date || null)}
          data-testid={`comp-sale-save-${comp.id}`}
          className="min-h-11 px-3 rounded-(--radius-pill) bg-(--color-accent) text-(--color-base) text-[12px] font-semibold disabled:opacity-50"
        >
          Use this sale
        </button>
        <button
          type="button"
          onClick={onCancel}
          data-testid={`comp-sale-cancel-${comp.id}`}
          className="min-h-11 px-3 rounded-(--radius-pill) border border-(--color-border-default) text-[12px] font-medium"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
