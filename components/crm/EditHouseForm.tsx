"use client";

import { useState } from "react";
import { type ActiveContext } from "@/lib/tenancy";
import { PROPERTY_TYPE_LABEL } from "@/lib/property/types";

/**
 * Edit what a house IS — its address, size and type.
 *
 * These were read-only, which meant a wrong sqft could not be corrected and a
 * mistyped address stayed mistyped. Both matter more than they look: sqft is
 * the multiplier in every ARV, and the address is the RentCast cache key and
 * the dedupe key.
 *
 * Saving marks the facts as hand-entered, so a later RentCast refresh fills
 * only the fields still blank and never overwrites a correction.
 */

export interface EditableHouse {
  id: string;
  address_line1: string;
  city: string | null;
  state: string | null;
  zip: string | null;
  property_type: string | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  year_built: number | null;
  annual_taxes: number | null;
  listing_url: string | null;
}

/** Empty string means "clear it"; the API distinguishes null from absent. */
function numberField(value: string): number | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : Number(trimmed);
}

function asText(value: number | string | null): string {
  return value === null || value === undefined ? "" : String(value);
}

export function EditHouseForm({
  house,
  ctx,
  onSaved,
  onCancel,
}: {
  house: EditableHouse;
  ctx: ActiveContext | null;
  onSaved: () => void | Promise<void>;
  onCancel: () => void;
}) {
  const [addressLine1, setAddressLine1] = useState(house.address_line1);
  const [city, setCity] = useState(asText(house.city));
  const [state, setState] = useState(asText(house.state));
  const [zip, setZip] = useState(asText(house.zip));
  const [propertyType, setPropertyType] = useState(house.property_type ?? "single_family");
  const [beds, setBeds] = useState(asText(house.beds));
  const [baths, setBaths] = useState(asText(house.baths));
  const [sqft, setSqft] = useState(asText(house.sqft));
  const [yearBuilt, setYearBuilt] = useState(asText(house.year_built));
  const [annualTaxes, setAnnualTaxes] = useState(asText(house.annual_taxes));
  const [listingUrl, setListingUrl] = useState(asText(house.listing_url));

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ctx) return;

    setSaving(true);
    setError(null);

    try {
      const res = await fetch(`/api/properties/${house.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          context_type: ctx.type,
          context_id: ctx.id,
          addressLine1,
          city: city.trim() || null,
          state: state.trim() || "GA",
          zip: zip.trim() || null,
          propertyType,
          beds: numberField(beds),
          baths: numberField(baths),
          sqft: numberField(sqft),
          yearBuilt: numberField(yearBuilt),
          annualTaxes: numberField(annualTaxes),
          listingUrl: listingUrl.trim() || null,
        }),
      });

      const text = await res.text();
      if (!res.ok) {
        let message = `Failed to save (HTTP ${res.status})`;
        try {
          const parsed = JSON.parse(text) as { error?: string };
          if (parsed.error) message = parsed.error;
        } catch {
          // Keep the status-based message.
        }
        throw new Error(message);
      }

      await onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  const field =
    "w-full bg-(--color-base) border border-(--color-border-default) rounded-lg px-3 py-2.5 text-[13px] focus:outline-none focus:border-(--color-accent) transition-colors";
  const label = "text-[11px] text-(--color-text-secondary)";

  return (
    <form
      onSubmit={submit}
      data-testid="edit-house-form"
      className="rounded-xl border border-(--color-border-default) bg-(--color-elevated) p-3 flex flex-col gap-3 mt-4"
    >
      <p className="text-[11px] text-(--color-text-secondary) leading-relaxed">
        What you enter here wins over RentCast. A refresh fills only the fields
        still blank.
      </p>

      <label className="flex flex-col gap-1">
        <span className={label}>Address</span>
        <input
          value={addressLine1}
          onChange={(e) => setAddressLine1(e.target.value)}
          required
          data-testid="edit-house-address"
          className={field}
        />
      </label>

      <div className="flex gap-2">
        <label className="flex flex-col gap-1 flex-1 min-w-0">
          <span className={label}>City</span>
          <input
            value={city}
            onChange={(e) => setCity(e.target.value)}
            data-testid="edit-house-city"
            className={field}
          />
        </label>
        <label className="flex flex-col gap-1 w-16 shrink-0">
          <span className={label}>State</span>
          <input
            value={state}
            onChange={(e) => setState(e.target.value.toUpperCase().slice(0, 2))}
            data-testid="edit-house-state"
            className={field}
          />
        </label>
        <label className="flex flex-col gap-1 w-24 shrink-0">
          <span className={label}>ZIP</span>
          <input
            value={zip}
            onChange={(e) => setZip(e.target.value)}
            inputMode="numeric"
            data-testid="edit-house-zip"
            className={field}
          />
        </label>
      </div>

      <label className="flex flex-col gap-1">
        <span className={label}>Type</span>
        <select
          value={propertyType}
          onChange={(e) => setPropertyType(e.target.value)}
          data-testid="edit-house-type"
          className={field}
        >
          {Object.entries(PROPERTY_TYPE_LABEL).map(([value, text]) => (
            <option key={value} value={value}>
              {text}
            </option>
          ))}
        </select>
      </label>

      <div className="flex gap-2">
        <label className="flex flex-col gap-1 flex-1 min-w-0">
          <span className={label}>Beds</span>
          <input
            value={beds}
            onChange={(e) => setBeds(e.target.value)}
            inputMode="decimal"
            data-testid="edit-house-beds"
            className={field}
          />
        </label>
        <label className="flex flex-col gap-1 flex-1 min-w-0">
          <span className={label}>Baths</span>
          <input
            value={baths}
            onChange={(e) => setBaths(e.target.value)}
            inputMode="decimal"
            data-testid="edit-house-baths"
            className={field}
          />
        </label>
        <label className="flex flex-col gap-1 flex-1 min-w-0">
          <span className={label}>Sqft</span>
          <input
            value={sqft}
            onChange={(e) => setSqft(e.target.value)}
            inputMode="numeric"
            data-testid="edit-house-sqft"
            className={field}
          />
        </label>
      </div>

      <div className="flex gap-2">
        <label className="flex flex-col gap-1 flex-1 min-w-0">
          <span className={label}>Year built</span>
          <input
            value={yearBuilt}
            onChange={(e) => setYearBuilt(e.target.value)}
            inputMode="numeric"
            data-testid="edit-house-year"
            className={field}
          />
        </label>
        <label className="flex flex-col gap-1 flex-1 min-w-0">
          <span className={label}>Annual taxes</span>
          <input
            value={annualTaxes}
            onChange={(e) => setAnnualTaxes(e.target.value)}
            inputMode="numeric"
            data-testid="edit-house-taxes"
            className={field}
          />
        </label>
      </div>

      <label className="flex flex-col gap-1">
        <span className={label}>Listing link</span>
        <input
          value={listingUrl}
          onChange={(e) => setListingUrl(e.target.value)}
          placeholder="https://…"
          data-testid="edit-house-listing"
          className={field}
        />
      </label>

      {error && (
        <p
          data-testid="edit-house-error"
          className="text-[12px] text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2"
        >
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving}
          data-testid="edit-house-save"
          className="h-10 px-4 rounded-[var(--radius-pill)] bg-(--color-accent) text-(--color-base) text-[13px] font-semibold disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          data-testid="edit-house-cancel"
          className="h-10 px-4 rounded-[var(--radius-pill)] border border-(--color-border-default) text-[13px] font-medium"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
