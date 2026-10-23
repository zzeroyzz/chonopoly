"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { type MortgageInputs } from "@/lib/mortgage/types";
import { calculateMortgage } from "@/lib/mortgage/calculate";
import { resolveInputs } from "@/lib/mortgage/resolveInputs";
import { buildDeal, holdingFrom } from "@/lib/deal/buildDeal";
import { offerCeiling } from "@/lib/offers/offerCeiling";
import { type ResolvedRehab } from "@/lib/rehab/resolveRehab";
import { taxDefaultsFrom } from "@/lib/mortgage/capitalGains";
import { type BuyerProfile } from "@/lib/profile/types";
import { OFFER_STATUSES, OFFER_STATUS_LABEL, type Offer, type OfferStatus } from "@/lib/offers/offerService";
import { Card, SectionLabel, NumberField, SelectField } from "@/components/mortgage/fields";
import { dollars } from "@/components/mortgage/format";

/**
 * Making an offer, with what it does to the deal.
 *
 * The question is never "what is this house worth" but "what can I pay and
 * still make money". Both ceilings are shown because they answer different
 * questions: the 70% rule is the convention buyers quote at each other, and
 * the profit floor is what this particular deal can actually carry once the
 * loan, the carry and the tax are accounted for. They are often far apart.
 */

interface Props {
  propertyId: string;
  ctxParams: string;
  askingPrice: number;
  primaryInputs: MortgageInputs | null;
  profile: BuyerProfile | null;
  arv: number | null;
  rehab: ResolvedRehab;
  state: string | null;
}

export function OfferPanel({
  propertyId,
  ctxParams,
  askingPrice,
  primaryInputs,
  profile,
  arv,
  rehab,
  state,
}: Props) {
  const [price, setPrice] = useState(askingPrice);
  const [status, setStatus] = useState<OfferStatus>("drafted");
  const [note, setNote] = useState("");
  const [offers, setOffers] = useState<Offer[]>([]);
  const [available, setAvailable] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/properties/${propertyId}/offers?${ctxParams}`);
      if (!res.ok) return;
      const body = (await res.json()) as { offers: Offer[]; available: boolean };
      setOffers(body.offers);
      setAvailable(body.available);
    } catch {
      // No history is not a broken page.
    }
  }, [propertyId, ctxParams]);

  useEffect(() => {
    (async () => {
      await load();
    })();
  }, [load]);

  const house = useMemo(
    () => ({
      arv,
      rehab,
      sellerClosingPct: profile?.defaults.sellingPct ?? 8,
      holding: holdingFrom(profile?.defaults),
      taxes: taxDefaultsFrom(profile?.defaults),
      state,
    }),
    [arv, rehab, profile, state]
  );

  /** The deal at a given price, from the same builder the Profit card uses. */
  const dealAt = useCallback(
    (at: number) => {
      if (!primaryInputs) return null;
      const inputs = resolveInputs(profile, { ...primaryInputs, homeValue: at });
      return buildDeal({ ...house, inputs, result: calculateMortgage(inputs) }).result;
    },
    [primaryInputs, profile, house]
  );

  const atAsking = useMemo(() => dealAt(askingPrice), [dealAt, askingPrice]);
  const atOffer = useMemo(() => dealAt(price), [dealAt, price]);

  const ceiling = useMemo(() => {
    if (!primaryInputs) return null;
    return offerCeiling({
      house,
      inputs: resolveInputs(profile, primaryInputs),
    });
  }, [primaryInputs, profile, house]);

  async function save() {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/properties/${propertyId}/offers?${ctxParams}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: price, status, note, context_type: "personal" }),
      });
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(b.error ?? "Could not save the offer");
      }
      setNote("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the offer");
    } finally {
      setSaving(false);
    }
  }

  if (!primaryInputs) {
    return (
      <p className="text-[12px] text-(--color-text-secondary) leading-relaxed">
        Run the numbers on this house first — an offer is judged against the
        financing, the rehab and the ARV.
      </p>
    );
  }

  return (
    <Card>
      <SectionLabel>Make an offer</SectionLabel>

      <NumberField
        label="Your price"
        testId="offer-price"
        value={price}
        onChange={setPrice}
        prefix="$"
        note={`Asking ${dollars(askingPrice, 0)}`}
        min={0}
      />

      {/* What the price does to the two figures that matter, beside what the
          asking price does, so the difference is the point. */}
      <div className="grid grid-cols-2 gap-3 mt-3">
        <Figure
          label="Walk-away"
          at={atOffer?.walkAwayCash ?? null}
          asking={atAsking?.walkAwayCash ?? null}
          testId="offer-walk-away"
        />
        <Figure
          label="True profit"
          at={atOffer?.trueProfit ?? null}
          asking={atAsking?.trueProfit ?? null}
          testId="offer-true-profit"
        />
      </div>

      {/* Two ceilings, because they answer different questions. */}
      <div className="grid gap-2 mt-4">
        <Ceiling
          label="70% rule"
          value={atOffer?.maxOffer ?? null}
          note="ARV × 70% − rehab. The convention, not a verdict."
          price={price}
          testId="ceiling-seventy"
        />
        <Ceiling
          label={`Hits your ${dollars(ceiling?.profitFloor ?? 0, 0)} floor`}
          value={ceiling?.unreachable ? null : (ceiling?.price ?? null)}
          note={
            ceiling?.unreachable
              ? "No price reaches it — the rehab, the carry or the fees are what is wrong."
              : "Found by searching the deal: price moves the loan, the carry and the tax."
          }
          price={price}
          testId="ceiling-floor"
        />
      </div>

      <div className="grid gap-2 mt-4">
        <SelectField
          label="Status"
          value={status}
          onChange={(v) => setStatus(v as OfferStatus)}
          options={OFFER_STATUSES.map((s) => ({ value: s, label: OFFER_STATUS_LABEL[s] }))}
        />
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Note (optional)"
          aria-label="Offer note"
          data-testid="offer-note"
          className="w-full h-9 rounded-md bg-(--color-elevated) border border-(--color-border-default) px-3 text-[12px] text-(--color-text-primary) focus:outline-none focus:border-(--color-accent)"
        />
      </div>

      {error && <p className="text-[11px] text-(--color-danger) mt-2">{error}</p>}
      {!available && (
        <p className="text-[11px] text-(--color-warning) mt-2 leading-relaxed">
          Offers need the offers migration to be run before they can be saved.
        </p>
      )}

      <button
        type="button"
        onClick={() => void save()}
        disabled={saving}
        data-testid="save-offer"
        className="w-full h-10 mt-3 rounded-md bg-(--color-accent) text-[13px] font-medium text-(--color-base) disabled:opacity-50"
      >
        {saving ? "Saving…" : "Save this offer"}
      </button>

      <p className="text-[10px] text-(--color-text-tertiary) mt-2 leading-relaxed">
        Saving records it in this house&rsquo;s Activity. It does not move the
        pipeline stage — that stays yours to change.
      </p>

      {offers.length > 0 && (
        <div className="mt-4 pt-3 border-t border-(--color-border-subtle)" data-testid="offer-history">
          <p className="text-[10px] uppercase tracking-widest text-(--color-text-tertiary) mb-1.5">
            Offers
          </p>
          {offers.map((o) => (
            <div
              key={o.id}
              className="flex items-baseline justify-between gap-2 py-1.5 border-b border-(--color-border-subtle) last:border-0"
            >
              <span className="text-[12px] font-(--font-mono) text-(--color-text-primary)">
                {dollars(o.amount, 0)}
              </span>
              <span className="text-[11px] text-(--color-text-secondary)">
                {OFFER_STATUS_LABEL[o.status]} · {o.offeredOn}
              </span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function Figure({
  label,
  at,
  asking,
  testId,
}: {
  label: string;
  at: number | null;
  asking: number | null;
  testId: string;
}) {
  const delta = at !== null && asking !== null ? at - asking : null;
  return (
    <div>
      <p className="text-[10px] uppercase tracking-widest text-(--color-text-tertiary)">{label}</p>
      <p
        data-testid={testId}
        className={`text-[16px] font-(--font-mono) ${
          at === null
            ? "text-(--color-text-tertiary)"
            : at < 0
              ? "text-(--color-danger)"
              : "text-(--color-text-primary)"
        }`}
      >
        {at === null ? "—" : dollars(at, 0)}
      </p>
      {delta !== null && Math.abs(delta) >= 1 && (
        <p className="text-[10px] text-(--color-text-tertiary)">
          {delta > 0 ? "+" : "−"}
          {dollars(Math.abs(delta), 0)} vs asking
        </p>
      )}
    </div>
  );
}

function Ceiling({
  label,
  value,
  note,
  price,
  testId,
}: {
  label: string;
  value: number | null;
  note: string;
  price: number;
  testId: string;
}) {
  const over = value !== null && price > value;
  return (
    <div
      data-testid={testId}
      className={`rounded-md border px-3 py-2 ${
        over ? "border-(--color-warning)" : "border-(--color-border-default)"
      }`}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] text-(--color-text-secondary)">{label}</span>
        <span className="text-[13px] font-(--font-mono) text-(--color-text-primary)">
          {value === null ? "—" : dollars(value, 0)}
        </span>
      </div>
      <p className="text-[10px] text-(--color-text-tertiary) leading-relaxed mt-0.5">
        {over ? `Your price is ${dollars(price - (value ?? 0), 0)} over this. ` : ""}
        {note}
      </p>
    </div>
  );
}
