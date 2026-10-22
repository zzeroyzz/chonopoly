"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, Check, Plus } from "lucide-react";
import { useCrmContext } from "@/components/crm/useCrmContext";

/**
 * Add houses by pasting a list.
 *
 * One box, one address per line. The realistic input is a paste from an email
 * or a text message, so the same box handles one house and twenty — a separate
 * "bulk mode" would be two forms for one job.
 *
 * Nothing is validated away silently. Every line comes back with what happened
 * to it, keyed to the line number the user can see, because a paste of twenty
 * that reports "18 added" without saying which two failed is not a result
 * anyone can act on.
 */

interface BatchResultRow {
  lineNumber: number;
  raw: string;
  status: "created" | "matched" | "failed";
  propertyId: string | null;
  needsAddressReview: boolean;
  message: string | null;
}

interface BatchResponse {
  results: BatchResultRow[];
  created: number;
  matched: number;
  failed: number;
}

const PLACEHOLDER = `128 Maple St, Duluth GA 30096, 250000, https://…
44 Oak Ave, Duluth GA 30096, 265k
1653 Sylvan Rd SW, Atlanta GA 30310`;

export function AddPropertyPage() {
  const router = useRouter();
  const { ctx } = useCrmContext();

  // One house is the normal case; the paste box is for a batch from an agent.
  const [mode, setMode] = useState<"one" | "several">("one");
  const [form, setForm] = useState({
    address_line1: "",
    city: "",
    state: "GA",
    zip: "",
    beds: "",
    baths: "",
    sqft: "",
    parcel_number: "",
    listing_url: "",
    photo_url: "",
    sales_price: "",
  });
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BatchResponse | null>(null);

  const lineCount = text.split("\n").filter((l) => l.trim()).length;

  async function submitOne(e: React.FormEvent) {
    e.preventDefault();
    if (!ctx || !form.address_line1.trim() || saving) return;

    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/properties", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, context_type: ctx.type, context_id: ctx.id }),
      });
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(b.error ?? "Could not add the house");
      }
      const body = (await res.json()) as { property: { id: string } };

      // Straight to the house, at the next step in the flow — the point of
      // adding one is to find out whether it is worth anything.
      router.push(`/properties/${body.property.id}?step=arv`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add the house");
      setSaving(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ctx || !text.trim()) return;

    setSaving(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/properties/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ context_type: ctx.type, context_id: ctx.id, text }),
      });

      const body = await res.text();
      if (!res.ok) {
        let message = `Failed to add (HTTP ${res.status})`;
        try {
          const parsed = JSON.parse(body) as { error?: string };
          if (parsed.error) message = parsed.error;
        } catch {
          // Keep the status message.
        }
        throw new Error(message);
      }

      setResult(JSON.parse(body) as BatchResponse);
      setText("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add the houses");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="overflow-y-auto flex-1 w-full px-5 py-4 pb-24 lg:pb-8">
        <h1 className="text-[18px] font-semibold mb-1 text-(--color-text-primary)">
          Add a house
        </h1>
        <p className="text-[12px] text-(--color-text-secondary) mb-4 leading-relaxed">
          Only the address is required. Anything else you know saves a lookup —
          and a figure you type is never overwritten by RentCast.
        </p>

        {/* One house is the normal case. The paste box stays for a batch from
            an agent, but it is the secondary option now rather than the only
            one. */}
        <div className="flex gap-1.5 mb-4">
          {(["one", "several"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              data-testid={`add-mode-${m}`}
              aria-pressed={mode === m}
              className={`h-8 px-3 rounded-[var(--radius-pill)] text-[12px] transition-colors ${
                mode === m
                  ? "bg-(--color-accent) text-(--color-base) font-semibold"
                  : "border border-(--color-border-default) text-(--color-text-secondary)"
              }`}
            >
              {m === "one" ? "One house" : "Paste several"}
            </button>
          ))}
        </div>

        {mode === "one" && (
          <form onSubmit={submitOne} className="grid gap-3" data-testid="add-one-form">
            <Field
              label="Street address"
              required
              value={form.address_line1}
              onChange={(v) => set({ address_line1: v })}
              testId="add-address"
              placeholder="1900 Windsor Dr SW"
            />
            <div className="grid grid-cols-3 gap-2">
              <Field label="City" value={form.city} onChange={(v) => set({ city: v })} testId="add-city" />
              <Field label="State" value={form.state} onChange={(v) => set({ state: v })} testId="add-state" />
              <Field label="ZIP" value={form.zip} onChange={(v) => set({ zip: v })} testId="add-zip" />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Field label="Beds" value={form.beds} onChange={(v) => set({ beds: v })} testId="add-beds" numeric />
              <Field label="Baths" value={form.baths} onChange={(v) => set({ baths: v })} testId="add-baths" numeric />
              <Field label="Sqft" value={form.sqft} onChange={(v) => set({ sqft: v })} testId="add-sqft" numeric />
            </div>
            <Field
              label="Sales price"
              value={form.sales_price}
              onChange={(v) => set({ sales_price: v })}
              testId="add-price"
              numeric
              placeholder="250000"
            />
            <Field
              label="Parcel number"
              value={form.parcel_number}
              onChange={(v) => set({ parcel_number: v })}
              testId="add-parcel"
            />
            <Field
              label="Listing link"
              value={form.listing_url}
              onChange={(v) => set({ listing_url: v })}
              testId="add-listing"
              placeholder="Zillow, Redfin or Realtor"
            />
            <Field
              label="Image URL"
              value={form.photo_url}
              onChange={(v) => set({ photo_url: v })}
              testId="add-image"
              placeholder="Paste an image link"
            />
            <p className="text-[11px] text-(--color-text-tertiary) leading-relaxed -mt-1">
              Uploading a photo needs the property-images bucket, which is
              written but not created yet. A pasted link works today.
            </p>

            <button
              type="submit"
              disabled={saving || !form.address_line1.trim() || !ctx}
              data-testid="add-one-submit"
              className="h-11 rounded-[var(--radius-pill)] bg-(--color-accent) text-(--color-base) text-[14px] font-semibold disabled:opacity-50"
            >
              {saving ? "Adding…" : "Add and find the ARV"}
            </button>

            {error && (
              <p data-testid="add-one-error" className="text-[12px] text-(--color-danger)">
                {error}
              </p>
            )}
          </form>
        )}

        {mode === "several" && (
        <form onSubmit={submit} className="flex flex-col gap-3">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={7}
            placeholder={PLACEHOLDER}
            data-testid="batch-addresses"
            className="w-full bg-(--color-base) border border-(--color-border-default) rounded-lg px-3 py-2.5 text-[13px] leading-relaxed font-mono focus:outline-none focus:border-(--color-accent) transition-colors"
          />

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={saving || !text.trim() || !ctx}
              data-testid="batch-submit"
              className="h-10 px-4 rounded-[var(--radius-pill)] bg-(--color-accent) text-(--color-base) text-[13px] font-semibold disabled:opacity-50"
            >
              {saving
                ? "Adding…"
                : lineCount > 1
                  ? `Add ${lineCount} houses`
                  : "Add house"}
            </button>

            {/* Comps are not pulled here on purpose — a paste of twenty would
                spend twenty of the month's fifty requests before anyone had
                decided which houses were worth it. */}
            <p className="text-[11px] text-(--color-text-tertiary) leading-relaxed">
              Comps are pulled per house, from its Comps tab.
            </p>
          </div>
        </form>
        )}

        {mode === "several" && error && (
          <p
            data-testid="batch-error"
            className="mt-4 text-[12px] text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2.5"
          >
            {error}
          </p>
        )}

        {mode === "several" && result && (
          <div data-testid="batch-result" className="mt-5">
            <p className="text-[13px] font-semibold text-(--color-text-primary)">
              {result.created} added
              {result.matched > 0 ? ` · ${result.matched} already known` : ""}
              {result.failed > 0 ? ` · ${result.failed} skipped` : ""}
            </p>

            <ul className="flex flex-col gap-1.5 mt-3">
              {result.results.map((row) => (
                <li
                  key={`${row.lineNumber}-${row.raw}`}
                  data-testid={`batch-line-${row.lineNumber}`}
                  className="flex items-start gap-2 text-[12px] rounded-lg border border-(--color-border-default) px-2.5 py-2"
                >
                  {row.status === "failed" ? (
                    <AlertTriangle size={12} className="shrink-0 mt-0.5 text-red-400" />
                  ) : (
                    <Check size={12} className="shrink-0 mt-0.5 text-(--color-accent)" />
                  )}

                  <div className="min-w-0 flex-1">
                    <p className="wrap-break-word text-(--color-text-primary)">
                      <span className="text-(--color-text-tertiary)">
                        Line {row.lineNumber}:{" "}
                      </span>
                      {row.raw}
                    </p>

                    {/* The reason, always — "skipped" with no cause is not a
                        result anyone can fix. */}
                    {row.message && (
                      <p
                        className={`mt-0.5 ${
                          row.status === "failed"
                            ? "text-red-400"
                            : "text-(--color-text-secondary)"
                        }`}
                      >
                        {row.message}
                      </p>
                    )}

                    {row.needsAddressReview && (
                      <p className="mt-0.5 text-amber-400">
                        Address needs a check before you rely on it
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>

            {result.created + result.matched > 0 && (
              <Link
                href="/properties"
                data-testid="batch-to-screen"
                className="inline-flex items-center gap-1 mt-4 text-[13px] text-(--color-accent) font-medium"
              >
                <Plus size={13} />
                Screen them
              </Link>
            )}
          </div>
        )}
      </div>
    </>
  );
}

/**
 * One labelled text input.
 *
 * A plain input rather than the calculator's NumberField even for the numeric
 * ones: these are "what I happen to know about this house", and a box that
 * insists on a number before you can leave it gets in the way of typing an
 * address and moving on.
 */
function Field({
  label,
  value,
  onChange,
  testId,
  placeholder,
  required = false,
  numeric = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  testId: string;
  placeholder?: string;
  required?: boolean;
  numeric?: boolean;
}) {
  return (
    <label className="block">
      <span className="block text-[10px] uppercase tracking-widest text-(--color-text-tertiary) mb-1">
        {label}
        {required && <span className="text-(--color-accent)"> *</span>}
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        inputMode={numeric ? "decimal" : undefined}
        data-testid={testId}
        className="w-full h-10 rounded-[var(--radius-md)] bg-(--color-elevated) border border-(--color-border-default) px-3 text-[14px] text-(--color-text-primary) placeholder-(--color-text-tertiary) focus:outline-none focus:border-(--color-accent) transition-colors"
      />
    </label>
  );
}
