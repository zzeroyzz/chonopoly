"use client";

import { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import {
  type BuyerProfile,
  type ProfileDebt,
  type ProfileIncome,
  totalMonthlyDebt,
  totalMonthlyIncome,
} from "@/lib/profile/types";
import { Card, SectionLabel, NumberField, ToggleRow } from "@/components/mortgage/fields";
import { dollars } from "@/components/mortgage/format";

/**
 * Settings → profile. The one place income and debts are edited after the
 * first-run modal creates them.
 *
 * Rows are named, never a single total: a lump sum cannot be audited later, and
 * `include in ratios` has nothing to attach to. An excluded debt stays visible
 * — it just leaves the ratios, which is how a lender exclusion actually works.
 */
/**
 * The column headings for a name/amount row.
 *
 * Shared by Income and Debts because the columns are the same question twice,
 * and a heading that drifts between two lists is worse than none.
 */
function ColumnHeaders() {
  return (
    <div className="flex items-end gap-2" aria-hidden="true">
      <span className="flex-1 min-w-0 text-[10px] uppercase tracking-widest text-(--color-text-tertiary) font-medium">
        Name
      </span>
      <span className="w-32 shrink-0 text-[10px] uppercase tracking-widest text-(--color-text-tertiary) font-medium">
        Monthly amount
      </span>
      {/* Matches the remove button, so the headings sit over their columns. */}
      <span className="w-[22px] shrink-0" />
    </div>
  );
}

export function ProfileForm() {
  const [profile, setProfile] = useState<BuyerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /**
   * What the server last confirmed, serialised.
   *
   * "Saved." is derived from this rather than being its own flag, so it can
   * only appear while what is on screen is exactly what the server stored. A
   * boolean would keep claiming success over edits made after the save.
   */
  const [savedSnapshot, setSavedSnapshot] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/profile/buyer");
        if (!res.ok) throw new Error("Could not load your profile");
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

  async function save() {
    if (!profile || saving) return;
    setSaving(true);
    setError(null);
    setSavedSnapshot(null);
    try {
      const res = await fetch("/api/profile/buyer", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cashAvailable: profile.cashAvailable,
          cashReserves: profile.cashReserves,
          incomes: profile.incomes,
          debts: profile.debts,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "Could not save");
      }
      // Read back what the server actually stored rather than trusting the
      // form's own state. If the server normalised or dropped something, this
      // is where it becomes visible instead of looking saved and being wrong.
      const body = (await res.json()) as { profile: BuyerProfile };
      setProfile(body.profile);
      setSavedSnapshot(JSON.stringify(body.profile));

      // Other open screens read the profile on focus; this tells them there is
      // something new to read, so the Properties list does not need a manual
      // refresh after income changes.
      try {
        window.localStorage.setItem("buyerProfileUpdatedAt", String(Date.now()));
      } catch {
        // Private mode: the list still refreshes when it regains focus.
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  // True only while the form matches what came back from the server.
  const saved =
    savedSnapshot !== null && profile !== null && JSON.stringify(profile) === savedSnapshot;

  if (loading) {
    return <p className="text-[12px] text-(--color-text-tertiary)">Loading…</p>;
  }

  if (!profile) {
    return (
      <Card>
        <SectionLabel>Your profile</SectionLabel>
        <p className="text-[12px] text-(--color-text-secondary) leading-relaxed">
          You haven&apos;t set one up yet. Open the mortgage calculator and choose
          <strong className="text-(--color-text-primary)"> Set income</strong> to
          create it.
        </p>
      </Card>
    );
  }

  const field =
    "h-10 rounded-[var(--radius-md)] bg-(--color-elevated) border border-(--color-border-default) " +
    "px-3 text-[14px] text-(--color-text-primary) placeholder-(--color-text-tertiary) " +
    "focus:outline-none focus:border-(--color-accent) transition-colors";

  return (
    <div className="grid gap-4">
      <Card>
        <SectionLabel>Income</SectionLabel>
        <div className="grid gap-2">
          {/* Named columns, once. Both boxes used to be unlabelled except for a
              placeholder that vanished the moment you typed, which is how an
              amount ended up in the name box. */}
          <ColumnHeaders />
          {profile.incomes.map((row, i) => (
            <div key={row.id || i} className="flex items-end gap-2">
              <input
                type="text"
                value={row.label}
                onChange={(e) => {
                  const incomes = [...profile.incomes];
                  incomes[i] = { ...row, label: e.target.value };
                  setProfile({ ...profile, incomes });
                }}
                aria-label={`Income name ${i + 1}`}
                data-testid={`settings-income-name-${i}`}
                placeholder="Salary"
                className={`${field} flex-1 min-w-0`}
              />
              <div className="w-32 shrink-0">
                <NumberField
                  label=""
                  ariaLabel={`Income amount ${i + 1}`}
                  testId={`settings-income-amount-${i}`}
                  value={row.grossMonthly}
                  onChange={(grossMonthly) => {
                    const incomes = [...profile.incomes];
                    incomes[i] = { ...row, grossMonthly };
                    setProfile({ ...profile, incomes });
                  }}
                  prefix="$"
                  suffix="/mo"
                  placeholder="0"
                  blankWhenZero
                  min={0}
                />
              </div>
              <button
                type="button"
                onClick={() =>
                  setProfile({ ...profile, incomes: profile.incomes.filter((_, n) => n !== i) })
                }
                aria-label={`Remove income ${i + 1}`}
                className="text-(--color-text-tertiary) hover:text-(--color-danger) p-1 shrink-0"
              >
                <X size={14} />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() =>
              setProfile({
                ...profile,
                incomes: [
                  ...profile.incomes,
                  { id: "", label: "", incomeType: "w2", grossMonthly: 0, borrower: null } as ProfileIncome,
                ],
              })
            }
            className="text-[12px] text-(--color-accent) inline-flex items-center gap-1 justify-self-start"
          >
            <Plus size={13} /> Add income
          </button>
          <p className="text-[11px] text-(--color-text-tertiary) leading-relaxed mt-1">
            W-2: gross monthly pay. 1099: average monthly net income from your
            last two years of tax returns.
          </p>
          <p className="text-[12px] text-(--color-text-secondary) mt-1 pt-2 border-t border-(--color-border-subtle)">
            Total {dollars(totalMonthlyIncome(profile.incomes), 0)}/mo
          </p>
        </div>
      </Card>

      <Card>
        <SectionLabel>Debts</SectionLabel>
        <div className="grid gap-2">
          <ColumnHeaders />
          {profile.debts.map((row, i) => (
            <div key={row.id || i}>
              <div className="flex items-end gap-2">
                <input
                  type="text"
                  value={row.label}
                  onChange={(e) => {
                    const debts = [...profile.debts];
                    debts[i] = { ...row, label: e.target.value };
                    setProfile({ ...profile, debts });
                  }}
                  aria-label={`Debt name ${i + 1}`}
                  data-testid={`settings-debt-name-${i}`}
                  placeholder="Car loan"
                  className={`${field} flex-1 min-w-0`}
                />
                <div className="w-32 shrink-0">
                  <NumberField
                    label=""
                    ariaLabel={`Debt amount ${i + 1}`}
                    testId={`settings-debt-amount-${i}`}
                    value={row.monthlyPayment}
                    onChange={(monthlyPayment) => {
                      const debts = [...profile.debts];
                      debts[i] = { ...row, monthlyPayment };
                      setProfile({ ...profile, debts });
                    }}
                    prefix="$"
                    suffix="/mo"
                    placeholder="0"
                    blankWhenZero
                    min={0}
                  />
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setProfile({ ...profile, debts: profile.debts.filter((_, n) => n !== i) })
                  }
                  aria-label={`Remove debt ${i + 1}`}
                  className="text-(--color-text-tertiary) hover:text-(--color-danger) p-1 shrink-0"
                >
                  <X size={14} />
                </button>
              </div>
              <ToggleRow
                label="Count this in my ratios"
                checked={row.includeInRatios}
                onChange={(includeInRatios) => {
                  const debts = [...profile.debts];
                  debts[i] = { ...row, includeInRatios };
                  setProfile({ ...profile, debts });
                }}
                hint="Lenders exclude some debts — a loan with a few payments left, or one someone else pays."
              />
            </div>
          ))}
          <button
            type="button"
            onClick={() =>
              setProfile({
                ...profile,
                debts: [
                  ...profile.debts,
                  { id: "", label: "", debtType: "other", monthlyPayment: 0, includeInRatios: true } as ProfileDebt,
                ],
              })
            }
            className="text-[12px] text-(--color-accent) inline-flex items-center gap-1 justify-self-start"
          >
            <Plus size={13} /> Add debt
          </button>
          <p className="text-[12px] text-(--color-text-secondary) mt-1 pt-2 border-t border-(--color-border-subtle)">
            Counted in ratios {dollars(totalMonthlyDebt(profile.debts), 0)}/mo
          </p>
        </div>
      </Card>

      <Card>
        <SectionLabel>Cash</SectionLabel>
        <div className="grid gap-3.5">
          <NumberField
            label="Available for down payment and closing"
            testId="settings-cash-available"
            value={profile.cashAvailable}
            onChange={(cashAvailable) => setProfile({ ...profile, cashAvailable })}
            prefix="$"
            placeholder="0"
            blankWhenZero
            min={0}
          />
          <NumberField
            label="Reserves to keep"
            testId="settings-cash-reserves"
            value={profile.cashReserves}
            onChange={(cashReserves) => setProfile({ ...profile, cashReserves })}
            prefix="$"
            placeholder="0"
            blankWhenZero
            min={0}
          />
        </div>
      </Card>

      {error && <p className="text-[12px] text-(--color-danger)">{error}</p>}
      {saved && (
        <p data-testid="profile-saved" className="text-[12px] text-(--color-accent)">
          Saved.
        </p>
      )}

      <button
        type="button"
        onClick={() => void save()}
        disabled={saving}
        data-testid="save-settings-profile"
        className="h-11 rounded-[var(--radius-pill)] bg-(--color-accent) text-(--color-base) text-[14px] font-semibold disabled:opacity-40 transition-opacity"
      >
        {saving ? "Saving…" : "Save changes"}
      </button>
    </div>
  );
}
