"use client";

import { useState } from "react";
import { X } from "lucide-react";

/**
 * Record a business you found.
 *
 * Only the name is required, because the name is the only thing you reliably
 * have the moment you find one. A form that demands a phone number before it
 * will save is a form you close and never come back to.
 *
 * It opens over the page rather than pushing it down — the same shape as the
 * house edit form, and outside any stacking context of its own so the bottom
 * bar cannot paint over its buttons.
 */
export function AddCompanyForm({
  ctxParams,
  onSaved,
  onCancel,
}: {
  ctxParams: string;
  onSaved: () => void | Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [website, setWebsite] = useState("");
  const [addressLine1, setAddressLine1] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [zip, setZip] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (name.trim().length === 0) {
      setError("Give the company a name first.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/crm/companies?${ctxParams}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, phone, website, addressLine1, city, state, zip }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to save");
      await onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save that company");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
        data-testid="add-company-form"
        className="relative flex flex-col w-full h-full sm:h-auto sm:max-w-md sm:rounded-(--radius-xl)
          bg-(--color-elevated) border border-(--color-border-default) overflow-hidden"
      >
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-(--color-border-subtle)">
          <h2 className="text-[15px] font-semibold text-(--color-text-primary)">Add a company</h2>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Close"
            data-testid="add-company-cancel"
            className="inline-flex items-center justify-center w-8 h-8 rounded-(--radius-pill)
              text-(--color-text-secondary) hover:text-(--color-text-primary)"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3">
          <Field label="Name" hint="The business, as you'd say it out loud.">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              data-testid="company-name"
              placeholder="Ground Floor LLC"
              className={INPUT}
            />
          </Field>

          <Field label="Phone" hint="Optional. The number you'd ring about a house.">
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              data-testid="company-phone"
              inputMode="tel"
              className={INPUT}
            />
          </Field>

          <Field label="Website" hint="Optional. Where their list of houses lives.">
            <input
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              data-testid="company-website"
              inputMode="url"
              className={INPUT}
            />
          </Field>

          <Field label="Address" hint="Optional.">
            <input
              value={addressLine1}
              onChange={(e) => setAddressLine1(e.target.value)}
              data-testid="company-address"
              className={INPUT}
            />
          </Field>

          <div className="grid grid-cols-3 gap-2">
            <input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="City"
              aria-label="City"
              data-testid="company-city"
              className={INPUT}
            />
            <input
              value={state}
              onChange={(e) => setState(e.target.value)}
              placeholder="State"
              aria-label="State"
              data-testid="company-state"
              className={INPUT}
            />
            <input
              value={zip}
              onChange={(e) => setZip(e.target.value)}
              placeholder="ZIP"
              aria-label="ZIP"
              data-testid="company-zip"
              className={INPUT}
            />
          </div>

          {error && (
            <p data-testid="add-company-error" className="text-[12px] text-(--color-danger)">
              {error}
            </p>
          )}
        </div>

        <div className="shrink-0 border-t border-(--color-border-subtle) p-4 flex gap-2 justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="h-10 px-4 rounded-(--radius-pill) border border-(--color-border-default) text-[13px] text-(--color-text-secondary)"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            data-testid="add-company-save"
            className="h-10 px-4 rounded-(--radius-pill) bg-(--color-accent) text-(--color-base) text-[13px] font-semibold disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </div>
  );
}

const INPUT =
  "w-full h-10 px-3 rounded-(--radius-md) bg-(--color-base) border border-(--color-border-default) " +
  "text-[14px] text-(--color-text-primary) placeholder:text-(--color-text-tertiary)";

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[12px] text-(--color-text-primary)">{label}</span>
      {children}
      <span className="text-[11px] text-(--color-text-secondary)">{hint}</span>
    </label>
  );
}
