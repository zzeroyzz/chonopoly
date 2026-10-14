"use client";

import { useState } from "react";
import { type ActiveContext } from "@/lib/tenancy";

/**
 * Add a lead by hand.
 *
 * Address only, plus the two fields that make deduping work. Everything else
 * about the house gets filled in later from the detail screen or an import —
 * asking for beds and baths before anyone has called the seller is asking for
 * data nobody has yet, and a form that can't be finished doesn't get used.
 */
export function AddLeadForm({
  ctx,
  onAdded,
}: {
  ctx: ActiveContext;
  onAdded: () => void | Promise<void>;
}) {
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [zip, setZip] = useState("");
  const [parcel, setParcel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function submit() {
    if (address.trim() === "") return;
    setBusy(true);
    try {
      const res = await fetch("/api/crm/pipeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address_line1: address.trim(),
          city: city.trim() || null,
          zip: zip.trim() || null,
          parcel_number: parcel.trim() || null,
          context_type: ctx.type,
          context_id: ctx.id,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to add the lead");

      // Say when a merge happened. Silently reusing a row is how two people end
      // up thinking they're working different houses.
      setNotice(
        data.matchedOn === "created"
          ? null
          : data.matchedOn === "parcel"
            ? "Matched an existing property by parcel number."
            : "Matched an existing property by address — check it before working it.",
      );

      setError(null);
      setAddress("");
      setCity("");
      setZip("");
      setParcel("");
      await onAdded();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add the lead");
    } finally {
      setBusy(false);
    }
  }

  const field =
    "text-[13px] bg-(--color-surface) border border-(--color-border-default) rounded-[var(--radius-md)] px-3 py-2 text-(--color-text-primary) placeholder:text-(--color-text-disabled) w-full";

  return (
    <div className="bg-(--color-surface) border border-(--color-border-default) rounded-[var(--radius-lg)] px-3.5 py-3 mb-3">
      <div className="grid gap-2">
        <input
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="Street address"
          data-testid="lead-address"
          className={field}
        />
        <div className="grid grid-cols-2 gap-2">
          <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="City" className={field} />
          <input value={zip} onChange={(e) => setZip(e.target.value)} placeholder="ZIP" className={field} />
        </div>
        <input
          value={parcel}
          onChange={(e) => setParcel(e.target.value)}
          placeholder="Parcel number (optional)"
          className={field}
        />
        <button
          type="button"
          data-testid="add-lead"
          disabled={busy || address.trim() === ""}
          onClick={() => void submit()}
          className="text-[13px] px-3 py-2 rounded-[var(--radius-md)] border border-(--color-border-default) text-(--color-text-secondary) hover:border-(--color-border-strong) transition-colors disabled:opacity-40"
        >
          {busy ? "Adding…" : "Add lead"}
        </button>
      </div>

      {notice && <p className="text-[11px] text-(--color-warning) mt-2">{notice}</p>}
      {error && <p className="text-[11px] text-(--color-danger) mt-2">{error}</p>}
    </div>
  );
}
