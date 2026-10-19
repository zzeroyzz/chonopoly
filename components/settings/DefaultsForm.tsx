"use client";

import { useEffect, useState } from "react";
import { type BuyerProfile, type ProfileDefaults } from "@/lib/profile/types";
import { LOAN_PRODUCTS, productValueFor } from "@/lib/mortgage/loanTypes";
import { type LoanType, type RenovationProgram, type DpaStructure } from "@/lib/mortgage/types";
import { X } from "lucide-react";
import {
  Card,
  SectionLabel,
  NumberField,
  SelectField,
  ToggleRow,
  FieldLabel,
} from "@/components/mortgage/fields";
import {
  FILING_STATUS_LABEL,
  DEFAULT_TAX_DEFAULTS,
  type FilingStatus,
} from "@/lib/mortgage/capitalGains";

/**
 * Settings → defaults. Where every screening starts before a house changes it.
 *
 * These are defaults, not fixed values: a scenario can still override any of
 * them. What they remove is retyping the same rate and term for every house.
 *
 * Flip costs are here and unused until Phase 4. They belong to this screen, and
 * splitting them out would mean a second migration on the same table.
 */
export function DefaultsForm() {
  const [profile, setProfile] = useState<BuyerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** The two-letter code being added to the state-rate list. */
  const [newState, setNewState] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/profile/buyer");
        if (!res.ok) throw new Error("Could not load your defaults");
        const body = (await res.json()) as { profile: BuyerProfile | null };
        if (!cancelled) setProfile(body.profile);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function patch(d: Partial<ProfileDefaults>) {
    if (!profile) return;
    setProfile({ ...profile, defaults: { ...profile.defaults, ...d } });
    setSaved(false);
  }

  async function save() {
    if (!profile || saving) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/profile/buyer", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ defaults: profile.defaults }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "Could not save");
      }
      const body = (await res.json()) as { profile: BuyerProfile };
      setProfile(body.profile);
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="text-[12px] text-(--color-text-tertiary)">Loading…</p>;
  }

  if (!profile) {
    return (
      <Card>
        <SectionLabel>Defaults</SectionLabel>
        <p className="text-[12px] text-(--color-text-secondary) leading-relaxed">
          You haven&apos;t set up a profile yet. Open the mortgage calculator and
          choose <strong className="text-(--color-text-primary)">Set income</strong>{" "}
          to create one — your defaults are created with it.
        </p>
      </Card>
    );
  }

  const d = profile.defaults;
  // Georgia is seeded by the migration's default; everything here is editable.
  const stateRates = d.stateTaxRatesPct ?? DEFAULT_TAX_DEFAULTS.stateRatesPct;

  return (
    <div className="grid gap-4">
      <Card>
        <SectionLabel>Loan</SectionLabel>
        <div className="grid gap-3.5">
          <SelectField
            label="Program"
            value={productValueFor(d.loanType as LoanType, d.renovationProgram as RenovationProgram)}
            // One dropdown, same as the calculator: the renovation programs set
            // two fields at once rather than being loan types of their own.
            onChange={(v) => {
              const product = LOAN_PRODUCTS.find((pr) => pr.value === v);
              if (!product) return;
              patch({ loanType: product.loanType, renovationProgram: product.renovationProgram });
            }}
            options={LOAN_PRODUCTS.map((pr) => ({ value: pr.value, label: pr.label }))}
          />
          <NumberField
            label="Interest rate"
            value={d.interestRate}
            onChange={(interestRate) => patch({ interestRate })}
            suffix="%"
            hint="your quote"
            min={0}
          />
          <NumberField
            label="Term"
            value={d.termYears}
            onChange={(termYears) => patch({ termYears })}
            suffix="yrs"
            min={1}
          />
          <NumberField
            label="Down payment"
            value={d.downPaymentPct}
            onChange={(downPaymentPct) => patch({ downPaymentPct })}
            suffix="%"
            note="Of price plus any financed renovation — the same basis the calculator uses."
            min={0}
          />
          <NumberField
            label="Closing costs"
            value={d.closingCostPct}
            onChange={(closingCostPct) => patch({ closingCostPct })}
            suffix="%"
            hint="of price"
            min={0}
          />
          <NumberField
            label="County loan limit"
            value={d.countyLoanLimit ?? 0}
            onChange={(n) => patch({ countyLoanLimit: n > 0 ? n : null })}
            prefix="$"
            note="Left at zero, no limit is applied. Used by the 203(k) cap check."
            min={0}
          />
        </div>
      </Card>

      <Card>
        <SectionLabel>Down payment assistance</SectionLabel>
        <div className="grid gap-3.5">
          <ToggleRow
            label="I'm using an assistance program by default"
            checked={d.dpaEnabled}
            onChange={(dpaEnabled) => patch({ dpaEnabled })}
            hint="Covers the minimum down payment first; the rest goes to closing costs."
          />
          {d.dpaEnabled && (
            <>
              <SelectField
                label="Structure"
                value={d.dpaStructure}
                onChange={(v) => patch({ dpaStructure: v as DpaStructure })}
                options={[
                  { value: "grant", label: "Grant — forgiven" },
                  { value: "deferred", label: "Deferred — no monthly payment" },
                  { value: "amortizing", label: "Amortizing second" },
                ]}
              />
              {d.dpaStructure === "amortizing" && (
                <>
                  <NumberField
                    label="Rate on the second"
                    value={d.dpaRate}
                    onChange={(dpaRate) => patch({ dpaRate })}
                    suffix="%"
                    note="0% is common."
                    min={0}
                  />
                  <NumberField
                    label="Term on the second"
                    value={d.dpaTermYears}
                    onChange={(dpaTermYears) => patch({ dpaTermYears })}
                    suffix="yrs"
                    min={1}
                  />
                </>
              )}
            </>
          )}
        </div>
      </Card>

      <Card>
        <SectionLabel>Flip costs</SectionLabel>
        <p className="text-[11px] text-(--color-text-tertiary) mb-3 leading-relaxed">
          Used by the flip analysis. Saved now so it is ready when that lands.
        </p>
        <div className="grid gap-3.5">
          <NumberField
            label="Buying costs"
            value={d.buyingPct}
            onChange={(buyingPct) => patch({ buyingPct })}
            suffix="%"
            hint="of price"
            min={0}
          />
          <NumberField
            label="Selling costs"
            value={d.sellingPct}
            onChange={(sellingPct) => patch({ sellingPct })}
            suffix="%"
            hint="of ARV"
            min={0}
          />
          <NumberField
            label="Holding cost"
            value={d.holdingMonthly}
            onChange={(holdingMonthly) => patch({ holdingMonthly })}
            prefix="$"
            hint="per month"
            min={0}
          />
          <NumberField
            label="Holding period"
            value={d.holdingMonths}
            onChange={(holdingMonths) => patch({ holdingMonths })}
            suffix="mo"
            min={0}
          />
          <NumberField
            label="Contingency — photo estimate"
            value={d.contingencyPhotosPct}
            onChange={(contingencyPhotosPct) => patch({ contingencyPhotosPct })}
            suffix="%"
            note="Higher than a walkthrough, because listing photos cannot show you a roof or what is behind a wall."
            min={0}
          />
          <NumberField
            label="Contingency — after a visit"
            value={d.contingencyVisitPct}
            onChange={(contingencyVisitPct) => patch({ contingencyVisitPct })}
            suffix="%"
            min={0}
          />
        </div>
      </Card>

      {/* Tax, for the capital-gains estimate on the Profit card. Rates belong
          to the person, not the house, which is why they live here. */}
      <Card>
        <SectionLabel>Taxes</SectionLabel>
        <div className="grid gap-3.5">
          <SelectField
            label="Filing status"
            value={d.filingStatus ?? "single"}
            onChange={(filingStatus) => patch({ filingStatus })}
            options={(Object.keys(FILING_STATUS_LABEL) as FilingStatus[]).map((value) => ({
              value,
              label: FILING_STATUS_LABEL[value],
            }))}
          />
          <div className="grid grid-cols-2 gap-3">
            <NumberField
              label="Federal — ordinary"
              testId="tax-federal-ordinary"
              value={d.federalOrdinaryPct ?? DEFAULT_TAX_DEFAULTS.federalOrdinaryPct}
              onChange={(federalOrdinaryPct) => patch({ federalOrdinaryPct })}
              suffix="%"
              hint="your bracket"
              min={0}
            />
            <NumberField
              label="Federal — long-term"
              testId="tax-federal-long-term"
              value={d.federalLongTermPct ?? DEFAULT_TAX_DEFAULTS.federalLongTermPct}
              onChange={(federalLongTermPct) => patch({ federalLongTermPct })}
              suffix="%"
              hint="held over a year"
              min={0}
            />
          </div>
          <p className="text-[11px] text-(--color-text-tertiary) leading-relaxed">
            A flip held twelve months or less is taxed at your ordinary rate,
            not the long-term one. The hold on each deal picks which applies.
          </p>

          <div>
            <FieldLabel hint="by state">State rate</FieldLabel>
            <div className="grid gap-2">
              {Object.entries(stateRates).map(([code, rate]) => (
                <div key={code} className="flex items-end gap-2">
                  {/* The state code IS the label, so the field names itself. */}
                  <div className="flex-1 min-w-0">
                    <NumberField
                      label={code}
                      testId={`tax-state-${code}`}
                      value={rate}
                      onChange={(next) =>
                        patch({ stateTaxRatesPct: { ...stateRates, [code]: next } })
                      }
                      suffix="%"
                      min={0}
                    />
                  </div>
                  <button
                    type="button"
                    aria-label={`Remove ${code}`}
                    onClick={() => {
                      const next = { ...stateRates };
                      delete next[code];
                      patch({ stateTaxRatesPct: next });
                    }}
                    className="text-(--color-text-tertiary) hover:text-(--color-danger) p-1 shrink-0"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2 mt-2">
              <input
                value={newState}
                onChange={(e) => setNewState(e.target.value.toUpperCase().slice(0, 2))}
                placeholder="FL"
                aria-label="Add a state"
                data-testid="tax-add-state-code"
                className="w-16 h-9 rounded-[var(--radius-md)] bg-(--color-elevated) border border-(--color-border-default) px-3 text-[13px] text-(--color-text-primary) uppercase"
              />
              <button
                type="button"
                disabled={newState.length !== 2 || newState in stateRates}
                onClick={() => {
                  patch({ stateTaxRatesPct: { ...stateRates, [newState]: 0 } });
                  setNewState("");
                }}
                data-testid="tax-add-state"
                className="text-[12px] text-(--color-accent) disabled:opacity-40"
              >
                Add a state
              </button>
            </div>
          </div>
        </div>
      </Card>

      {error && <p className="text-[12px] text-(--color-danger)">{error}</p>}
      {saved && <p className="text-[12px] text-(--color-accent)">Saved.</p>}

      <button
        type="button"
        onClick={() => void save()}
        disabled={saving}
        data-testid="save-settings-defaults"
        className="h-11 rounded-[var(--radius-pill)] bg-(--color-accent) text-(--color-base) text-[14px] font-semibold disabled:opacity-40 transition-opacity"
      >
        {saving ? "Saving…" : "Save defaults"}
      </button>
    </div>
  );
}
