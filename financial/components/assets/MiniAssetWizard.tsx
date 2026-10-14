"use client";

import { useState, useEffect, useCallback } from "react";
import type { DebtSummary } from "@/lib/debts/types";

// ─── Constants ─────────────────────────────────────────────────────────────────

const ASSET_CATEGORIES = [
  { value: 'cash',         label: 'Cash & Savings',     icon: '💵', liquid: true,  dbValue: 'cash'        },
  { value: 'investment',   label: 'Investment',          icon: '📈', liquid: true,  dbValue: 'investment'  },
  { value: 'retirement',   label: 'Retirement',          icon: '🏦', liquid: false, dbValue: 'retirement'  },
  { value: 'real_property',label: 'Real Property',       icon: '🏠', liquid: false, dbValue: 'real_estate' },
  { value: 'vehicle',      label: 'Vehicle',             icon: '🚗', liquid: false, dbValue: 'vehicle'     },
  { value: 'business',     label: 'Business Interest',   icon: '💼', liquid: false, dbValue: 'business'    },
  { value: 'personal',     label: 'Personal Property',   icon: '💍', liquid: false, dbValue: 'personal'    },
  { value: 'other',        label: 'Other',               icon: '📋', liquid: false, dbValue: 'other'       },
] as const;

type CategoryValue = typeof ASSET_CATEGORIES[number]['value'];

const VALUE_HINTS: Record<CategoryValue, string> = {
  cash:         'Enter the current account balance.',
  investment:   'This may already be tracked via your connected bank. Enter the current balance.',
  retirement:   'This may already be tracked via your connected bank. Enter the current account balance.',
  real_property:'Use Zillow or Redfin to look up your home\'s estimated value.',
  vehicle:      'Use KBB to look up your vehicle\'s value.',
  business:     'Enter the current market value — what someone would pay you for it today.',
  personal:     'What would you get if you sold everything today — furniture, electronics, jewelry, clothing?',
  other:        'Enter the current market value — what someone would pay you for it today.',
};

// ─── Types ─────────────────────────────────────────────────────────────────────

interface MiniAssetWizardProps {
  onSuccess: (assetId: string, assetName: string) => void;
  onClose: () => void;
  contextType?: string;
  contextId?: string;
  zIndex?: number;
  prefillName?: string;
  prefillLinkedDebtId?: string;
}

interface AssetFormState {
  name: string;
  asset_type: CategoryValue | '';
  value: string;
  is_liquid: boolean;
  linked_debt_id: string | null;
}

// ─── Component ─────────────────────────────────────────────────────────────────

export function MiniAssetWizard({
  onSuccess, onClose, contextType, contextId,
  zIndex = 60, prefillName, prefillLinkedDebtId,
}: MiniAssetWizardProps) {
  const [step, setStep] = useState(1);
  const [anim, setAnim] = useState<'wizard-enter-forward' | 'wizard-enter-back'>('wizard-enter-forward');
  const [form, setForm] = useState<AssetFormState>({
    name:           prefillName           ?? '',
    asset_type:     '',
    value:          '',
    is_liquid:      false,
    linked_debt_id: prefillLinkedDebtId   ?? null,
  });
  const [saving, setSaving]       = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [debts, setDebts]         = useState<DebtSummary[]>([]);
  const [debtsLoading, setDebtsLoading] = useState(false);
  const [debtChoice, setDebtChoice] = useState<'yes' | null>(null);

  // ── Validation ──────────────────────────────────────────────────────────────
  const stepValid =
    step === 1 ? form.name.trim().length > 0 :
    step === 2 ? form.asset_type !== '' :
    step === 3 ? parseFloat(form.value) > 0 :
    true;

  // ── Escape key ──────────────────────────────────────────────────────────────
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  // ── Debt fetch (step 5) ─────────────────────────────────────────────────────
  const fetchDebts = useCallback(async () => {
    setDebtsLoading(true);
    try {
      const params = contextType ? `?context_type=${contextType}&context_id=${contextId}` : '';
      const res = await fetch(`/api/debts/summary${params}`);
      const data = await res.json();
      setDebts(data.debts ?? []);
    } finally {
      setDebtsLoading(false);
    }
  }, [contextType, contextId]);

  useEffect(() => {
    if (step === 5) fetchDebts();
  }, [step, fetchDebts]);

  // ── Navigation ──────────────────────────────────────────────────────────────
  function advanceStep() {
    if (step === 5) setDebtChoice(null);
    setAnim('wizard-enter-forward');
    setStep(s => s + 1);
  }

  function backStep() {
    if (step === 5) setDebtChoice(null);
    setAnim('wizard-enter-back');
    setStep(s => s - 1);
  }

  // ── Save ────────────────────────────────────────────────────────────────────
  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    const name = form.name.trim();
    const cat = ASSET_CATEGORIES.find(c => c.value === form.asset_type);
    try {
      const res = await fetch('/api/assets/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          icon:           cat?.icon    ?? '📋',
          asset_type:     cat?.dbValue ?? 'other',
          current_value:  parseFloat(form.value),
          is_liquid:      form.is_liquid,
          linked_debt_id: form.linked_debt_id ?? null,
          ...(contextType ? { context_type: contextType, context_id: contextId } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSaveError(data.error ?? 'Failed to save. Please try again.');
        setSaving(false);
        return;
      }
      onSuccess(data.asset_id, name);
    } catch {
      setSaveError('Network error — try again.');
      setSaving(false);
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 flex items-center justify-center" style={{ zIndex }} onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-[6px]" />
      <div
        className="relative bg-(--color-elevated) border border-(--color-border-default) rounded-xl w-full max-w-lg mx-4 p-6 flex flex-col gap-5 max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >

        {/* Progress dots — 6 dots (step 6/Review has no dot) */}
        <div className="flex items-center justify-center gap-2">
          {Array.from({ length: 6 }, (_, i) => {
            const isActive = step === i + 1;
            const isDone   = step > i + 1;
            return (
              <div
                key={i}
                style={{
                  width: isActive ? 8 : 6,
                  height: isActive ? 8 : 6,
                  borderRadius: '50%',
                  background: isActive || isDone ? 'var(--color-accent)' : 'transparent',
                  border: isActive || isDone ? 'none' : '1px solid var(--color-border-strong)',
                  transition: 'all 200ms',
                }}
              />
            );
          })}
        </div>

        {/* Animated step content */}
        <div key={step} className={anim}>

          {/* ── Step 1 — Name ──────────────────────────────────────────────── */}
          {step === 1 && (
            <div className="flex flex-col gap-5">
              <p className="text-[22px] font-bold text-(--color-text-primary)">
                What&apos;s this asset called?
              </p>
              <input
                autoFocus
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                onKeyDown={e => { if (e.key === 'Enter' && form.name.trim()) advanceStep(); }}
                placeholder="Home, Toyota Camry, Fidelity 401k..."
                className="w-full bg-(--color-base) border border-(--color-border-default) rounded-xl px-4 py-3 text-[16px] text-(--color-text-primary) placeholder:text-(--color-text-tertiary) outline-none focus:border-(--color-accent)"
              />
            </div>
          )}

          {/* ── Step 2 — Category ──────────────────────────────────────────── */}
          {step === 2 && (
            <div className="flex flex-col gap-5">
              <p className="text-[22px] font-bold text-(--color-text-primary)">
                What type of asset is this?
              </p>
              <div className="grid grid-cols-2 gap-3">
                {ASSET_CATEGORIES.map(({ value, label, icon }) => (
                  <button
                    key={value}
                    onClick={() => {
                      const cat = ASSET_CATEGORIES.find(c => c.value === value)!;
                      setForm(f => ({ ...f, asset_type: value, is_liquid: cat.liquid }));
                    }}
                    className={`p-4 rounded-xl border text-left transition-all ${form.asset_type === value ? 'border-(--color-accent) bg-(--color-accent)/8' : 'border-(--color-border-default) hover:border-(--color-border-strong)'}`}
                  >
                    <span className="text-[20px]">{icon}</span>
                    <p className="text-[13px] font-semibold text-(--color-text-primary) mt-1">{label}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── Step 3 — Value ─────────────────────────────────────────────── */}
          {step === 3 && (
            <div className="flex flex-col gap-4">
              <p className="text-[22px] font-bold text-(--color-text-primary)">
                What&apos;s it worth today?
              </p>
              <div className="flex items-center gap-2 bg-(--color-base) border border-(--color-border-default) rounded-xl px-4 py-3 focus-within:border-(--color-accent)">
                <span className="text-[18px] text-(--color-text-tertiary)">$</span>
                <input
                  autoFocus
                  type="number" min="0" step="0.01"
                  value={form.value}
                  onChange={e => setForm(f => ({ ...f, value: e.target.value }))}
                  placeholder="0.00"
                  className="flex-1 bg-transparent text-[18px] text-(--color-text-primary) placeholder:text-(--color-text-tertiary) outline-none"
                />
              </div>
              {form.asset_type && (
                <p className="text-[13px] text-(--color-text-secondary)">
                  {VALUE_HINTS[form.asset_type as CategoryValue]}
                </p>
              )}
            </div>
          )}

          {/* ── Step 4 — Liquid? ───────────────────────────────────────────── */}
          {step === 4 && (
            <div className="flex flex-col gap-4">
              <p className="text-[22px] font-bold text-(--color-text-primary)">
                Can you convert this to cash within a week?
              </p>
              <div className="flex flex-col gap-2">
                {[
                  { value: true,  label: "Yes — it's liquid" },
                  { value: false, label: "No — it's tied up"  },
                ].map(opt => (
                  <button
                    key={String(opt.value)}
                    onClick={() => setForm(f => ({ ...f, is_liquid: opt.value }))}
                    className={`w-full py-3 px-4 rounded-xl border text-[14px] text-left font-medium transition-all ${form.is_liquid === opt.value ? 'border-(--color-accent) bg-(--color-accent)/8 text-(--color-text-primary)' : 'border-(--color-border-default) text-(--color-text-secondary) hover:border-(--color-border-strong)'}`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <div className="p-3 rounded-xl bg-(--color-overlay) text-[12px] text-(--color-text-secondary) leading-relaxed">
                💡 Liquid assets (cash, stocks) count toward investable assets. Non-liquid assets still count toward net worth.
              </div>
            </div>
          )}

          {/* ── Step 5 — Debt link ─────────────────────────────────────────── */}
          {step === 5 && (
            <div className="flex flex-col gap-4">
              <p className="text-[22px] font-bold text-(--color-text-primary)">
                Is there a loan against this asset?
              </p>
              <p className="text-[13px] text-(--color-text-secondary)">
                e.g. a car loan against your vehicle, or a mortgage against your home.
              </p>
              {!debtChoice && (
                <div className="flex flex-col gap-2 mt-1">
                  <button
                    onClick={() => setDebtChoice('yes')}
                    className="w-full py-3 px-4 rounded-xl border border-(--color-border-default) text-[14px] text-(--color-text-primary) hover:border-(--color-border-strong) transition-colors text-left"
                  >
                    Yes, link a debt
                  </button>
                  <button
                    onClick={advanceStep}
                    className="w-full py-3 px-4 rounded-xl border border-(--color-border-default) text-[14px] text-(--color-text-secondary) hover:text-(--color-text-primary) transition-colors text-left"
                  >
                    No, it&apos;s owned free and clear
                  </button>
                </div>
              )}
              {debtChoice === 'yes' && (
                <div className="flex flex-col gap-2 mt-1">
                  {debtsLoading && (
                    <p className="text-[13px] text-(--color-text-tertiary)">Loading debts…</p>
                  )}
                  {!debtsLoading && debts.length === 0 && (
                    <p className="text-[13px] text-(--color-text-tertiary)">
                      No debts found. You can link one later.
                    </p>
                  )}
                  {!debtsLoading && debts.map(debt => (
                    <button
                      key={debt.id}
                      onClick={() => {
                        setForm(f => ({ ...f, linked_debt_id: debt.id }));
                        advanceStep();
                      }}
                      className={`flex items-center justify-between p-3 rounded-xl border transition-colors text-left ${form.linked_debt_id === debt.id ? 'border-(--color-accent) bg-(--color-accent)/8' : 'border-(--color-border-default) hover:border-(--color-accent) bg-(--color-base)'}`}
                    >
                      <span className="text-[13px] text-(--color-text-primary)">{debt.name}</span>
                      <span className="text-[12px] font-(--font-mono) text-(--color-text-secondary)">
                        ${debt.current_balance.toLocaleString()}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Step 6 — Review ────────────────────────────────────────────── */}
          {step === 6 && (
            <div className="flex flex-col gap-5">
              <p className="text-[22px] font-bold text-(--color-text-primary)">
                Does this look right?
              </p>
              <div className="p-4 rounded-xl border border-(--color-border-default) bg-(--color-base) flex flex-col gap-4">
                {(() => {
                  const cat = ASSET_CATEGORIES.find(c => c.value === form.asset_type);
                  const linkedDebt = debts.find(d => d.id === form.linked_debt_id);
                  return (
                    <>
                      <div className="flex items-baseline justify-between">
                        <p className="text-[20px] font-bold text-(--color-text-primary)">{form.name}</p>
                        <span className="text-[11px] px-2 py-0.5 rounded-full border border-(--color-border-default) text-(--color-text-secondary)">
                          {cat?.label ?? form.asset_type}
                        </span>
                      </div>
                      <p className="text-[26px] font-(--font-mono) font-bold text-(--color-accent)">
                        ${parseFloat(form.value || '0').toLocaleString()}
                      </p>
                      <div className="grid grid-cols-2 gap-3">
                        {([
                          ['Liquidity', form.is_liquid ? 'Liquid' : 'Non-liquid'],
                          ...(linkedDebt ? [['Linked debt', `${linkedDebt.name} ($${linkedDebt.current_balance.toLocaleString()})`]] : []),
                        ] as [string, string][]).map(([label, value]) => (
                          <div key={label}>
                            <p className="text-[10px] text-(--color-text-tertiary) uppercase tracking-[0.1em] mb-0.5">{label}</p>
                            <p className="text-[13px] font-(--font-mono) text-(--color-text-primary)">{value}</p>
                          </div>
                        ))}
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>
          )}

        </div>

        {/* Save error */}
        {saveError && (
          <p className="text-[12px] text-(--color-danger)">{saveError}</p>
        )}

        {/* Nav */}
        <div className="flex flex-col gap-3">
          <div className="flex gap-3">
            {step > 1 && (
              <button
                onClick={backStep}
                className="flex-1 py-2.5 rounded-xl text-[13px] border border-(--color-border-default) text-(--color-text-secondary) hover:text-(--color-text-primary) transition-colors"
              >
                ← Back
              </button>
            )}
            {step !== 5 && (
              <button
                onClick={step === 6 ? handleSave : advanceStep}
                disabled={!stepValid || saving}
                className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold disabled:opacity-30 transition-opacity"
                style={{ background: 'var(--color-accent)', color: 'var(--color-base)' }}
              >
                {step === 6 ? (saving ? 'Saving…' : 'Save asset →') : 'Continue →'}
              </button>
            )}
            {step === 5 && debtChoice === 'yes' && (
              <button
                onClick={advanceStep}
                className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold"
                style={{ background: 'var(--color-accent)', color: 'var(--color-base)' }}
              >
                Skip →
              </button>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-center text-[12px] text-(--color-text-tertiary) hover:text-(--color-text-primary) transition-colors"
          >
            Cancel
          </button>
        </div>

      </div>
    </div>
  );
}
