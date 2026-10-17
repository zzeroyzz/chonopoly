"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { type BuyerProfile } from "@/lib/profile/types";

interface Row {
  label: string;
  amount: string;
}

const FIELD_CLASS =
  "h-10 rounded-[var(--radius-md)] bg-(--color-elevated) border border-(--color-border-default) " +
  "px-3 text-[14px] text-(--color-text-primary) placeholder-(--color-text-tertiary) " +
  "focus:outline-none focus:border-(--color-accent) transition-colors";

function RowList({
  rows,
  setRows,
  namePlaceholder,
  testid,
}: {
  rows: Row[];
  setRows: (r: Row[]) => void;
  namePlaceholder: string;
  testid: string;
}) {
  return (
    <>
      {rows.map((row, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            type="text"
            value={row.label}
            onChange={(e) => {
              const next = [...rows];
              next[i] = { ...next[i], label: e.target.value };
              setRows(next);
            }}
            placeholder={namePlaceholder}
            aria-label={`${testid} name ${i + 1}`}
            data-testid={`${testid}-name-${i}`}
            className={`${FIELD_CLASS} flex-1 min-w-0`}
          />
          <div className="relative w-28 shrink-0">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-(--color-text-tertiary)">
              $
            </span>
            <input
              type="text"
              inputMode="numeric"
              value={row.amount}
              onChange={(e) => {
                const next = [...rows];
                next[i] = { ...next[i], amount: e.target.value.replace(/[^\d.]/g, "") };
                setRows(next);
              }}
              placeholder="0"
              aria-label={`${testid} amount ${i + 1}`}
              data-testid={`${testid}-amount-${i}`}
              className={`${FIELD_CLASS} w-full pl-6 font-(--font-mono)`}
            />
          </div>
          {rows.length > 1 && (
            <button
              type="button"
              onClick={() => setRows(rows.filter((_, n) => n !== i))}
              aria-label={`Remove ${testid} ${i + 1}`}
              className="text-(--color-text-tertiary) hover:text-(--color-danger) p-1 shrink-0"
            >
              <X size={14} />
            </button>
          )}
        </div>
      ))}
      <button
        type="button"
        onClick={() => setRows([...rows, { label: "", amount: "" }])}
        className="text-[12px] text-(--color-accent) inline-flex items-center gap-1 mt-0.5"
      >
        <Plus size={13} />
        Add another
      </button>
    </>
  );
}

/**
 * First run only: collect enough to produce a verdict, and create the profile.
 *
 * Deliberately not an inline editor. Once a profile exists this never appears
 * again — the calculator shows the figures read-only and Settings is the one
 * place to change them. An editable copy here would put the same number in two
 * places and make a verdict depend on which one you happened to be reading.
 *
 * Income and debts are itemised, never a single total: a lump sum is
 * unauditable later, and `include in ratios` has nothing to attach to.
 */
export function FirstRunIncomeModal({
  onCreated,
  onClose,
}: {
  onCreated: (profile: BuyerProfile) => void;
  onClose: () => void;
}) {
  const [incomes, setIncomes] = useState<Row[]>([{ label: "", amount: "" }]);
  const [debts, setDebts] = useState<Row[]>([{ label: "", amount: "" }]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const named = (rows: Row[]) => rows.filter((r) => r.label.trim() !== "");
  const canSave = named(incomes).length > 0 && !busy;

  async function save() {
    if (!canSave) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/profile/buyer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          incomes: named(incomes).map((r) => ({
            label: r.label.trim(),
            grossMonthly: Number(r.amount) || 0,
          })),
          debts: named(debts).map((r) => ({
            label: r.label.trim(),
            monthlyPayment: Number(r.amount) || 0,
          })),
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "Could not save");
      }
      const body = (await res.json()) as { profile: BuyerProfile };
      onCreated(body.profile);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Set your income"
    >
      <div className="bg-(--color-surface) border border-(--color-border-default) rounded-t-[var(--radius-xl)] sm:rounded-[var(--radius-xl)] w-full sm:max-w-md max-h-[90vh] overflow-y-auto p-5">
        <div className="flex items-start justify-between gap-3 mb-1">
          <h2 className="text-[17px] font-semibold text-(--color-text-primary)">
            Set your income
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-(--color-text-tertiary) hover:text-(--color-text-primary) p-1 -mr-1"
          >
            <X size={16} />
          </button>
        </div>
        <p className="text-[12px] text-(--color-text-secondary) mb-4 leading-relaxed">
          Entered once, used for every house you screen. You can change it later in
          Settings.
        </p>

        <p className="text-[10px] uppercase tracking-widest text-(--color-text-tertiary) mb-2">
          Monthly income, before tax
        </p>
        <div className="grid gap-2 mb-5">
          <RowList
            rows={incomes}
            setRows={setIncomes}
            namePlaceholder="Salary"
            testid="income"
          />
        </div>

        <p className="text-[10px] uppercase tracking-widest text-(--color-text-tertiary) mb-2">
          Monthly debt payments
        </p>
        <div className="grid gap-2 mb-2">
          <RowList
            rows={debts}
            setRows={setDebts}
            namePlaceholder="Car loan"
            testid="debt"
          />
        </div>
        <p className="text-[11px] text-(--color-text-tertiary) mb-5 leading-relaxed">
          Name each one. A lender counts them separately, and you can exclude any of
          them later.
        </p>

        {error && <p className="text-[12px] text-(--color-danger) mb-3">{error}</p>}

        <button
          type="button"
          onClick={() => void save()}
          disabled={!canSave}
          data-testid="save-profile"
          className="w-full h-11 rounded-[var(--radius-pill)] bg-(--color-accent) text-(--color-base) text-[14px] font-semibold disabled:opacity-40 transition-opacity"
        >
          {busy ? "Saving…" : "Save and see my numbers"}
        </button>
      </div>
    </div>
  );
}
