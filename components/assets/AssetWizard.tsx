"use client";

import { useState, useEffect, useRef, useCallback } from "react";
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

const CATEGORY_COLORS: Record<CategoryValue, string> = {
  cash:         'var(--color-accent)',
  investment:   '#60a5fa',
  retirement:   '#a78bfa',
  real_property:'#fbbf24',
  vehicle:      '#fb923c',
  business:     '#2dd4bf',
  personal:     '#f472b6',
  other:        'var(--color-text-secondary)',
};

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

interface AssetWizardProps {
  onSuccess: (assetId: string, assetName: string) => void;
  onClose: () => void;
  contextType?: string;
  contextId?: string;
  zIndex?: number;
  onAssetSaved?: () => void;
  prefillName?: string;
  prefillLinkedDebtId?: string;
}

interface AssetWizardState {
  name: string;
  asset_type: CategoryValue | '';
  value: string;
  is_liquid: boolean;
  linked_debt_id: string | null;
}

// ─── Viz components ────────────────────────────────────────────────────────────

export function Step1AssetViz() {
  return (
    <div className="hidden md:flex flex-col items-center justify-center h-full bg-(--color-elevated) gap-6 px-8">
      <div className="rock-scale" style={{ transformOrigin: 'center 10px' }}>
        <svg width="180" height="140" viewBox="0 0 180 140">
          {/* Fulcrum */}
          <polygon points="90,110 78,130 102,130" fill="var(--color-border-strong)" />
          <rect x="70" y="128" width="40" height="4" rx="2" fill="var(--color-border-strong)" />
          {/* Beam — tilted: Assets side lower */}
          <line x1="20" y1="58" x2="160" y2="42" stroke="var(--color-text-secondary)" strokeWidth="3" strokeLinecap="round" />
          {/* Left pan — Debts (higher) */}
          <line x1="20" y1="58" x2="20" y2="78" stroke="var(--color-text-secondary)" strokeWidth="2" />
          <ellipse cx="20" cy="82" rx="22" ry="6" fill="var(--color-overlay)" stroke="var(--color-border-default)" strokeWidth="1.5" />
          <text x="20" y="85" textAnchor="middle" fontSize="8" fill="var(--color-text-tertiary)" fontFamily="var(--font-body)">Debts</text>
          {/* Right pan — Assets (lower) */}
          <line x1="160" y1="42" x2="160" y2="82" stroke="var(--color-accent)" strokeWidth="2" />
          <ellipse cx="160" cy="86" rx="22" ry="6" fill="rgba(0,212,170,0.12)" stroke="var(--color-accent)" strokeWidth="1.5" />
          <text x="160" y="89" textAnchor="middle" fontSize="8" fill="var(--color-accent)" fontFamily="var(--font-body)">Assets</text>
          {/* Pivot dot */}
          <circle cx="90" cy="110" r="5" fill="var(--color-text-tertiary)" />
        </svg>
      </div>
      <p className="text-[11px] text-(--color-text-tertiary) uppercase tracking-widest text-center">
        Let&apos;s tip the scale
      </p>
    </div>
  );
}

export function Step2AssetViz({ category }: { category: CategoryValue | '' }) {
  const meta = ASSET_CATEGORIES.find(c => c.value === category);
  const color = category ? CATEGORY_COLORS[category as CategoryValue] : 'var(--color-overlay)';
  return (
    <div className="hidden md:flex flex-col items-center justify-center h-full bg-(--color-elevated)">
      <div
        className={`w-32 h-32 rounded-full border-2 flex items-center justify-center transition-all duration-300 ${meta ? 'debt-type-pulse' : ''}`}
        style={{
          background: meta ? `${color}20` : 'var(--color-overlay)',
          borderColor: meta ? color : 'var(--color-border-default)',
        }}
      >
        {meta ? (
          <span key={category} className="text-5xl" style={{ animation: 'scaleIn 250ms ease-out forwards' }}>
            {meta.icon}
          </span>
        ) : (
          <span className="text-[11px] text-(--color-text-disabled) uppercase tracking-widest">Pick one</span>
        )}
      </div>
      {meta && <p className="text-[13px] text-(--color-text-secondary) mt-4">{meta.label}</p>}
    </div>
  );
}

export function Step3AssetViz({ amount }: { amount: string }) {
  const parsed = parseFloat(amount) || 0;
  const MAX = 500_000;
  const targetPct = Math.min(parsed / MAX * 100, 100);
  const displayPctRef = useRef(0);
  const [displayPct, setDisplayPct] = useState(0);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const animate = () => {
      const diff = targetPct - displayPctRef.current;
      if (Math.abs(diff) < 0.1) { displayPctRef.current = targetPct; setDisplayPct(targetPct); return; }
      displayPctRef.current += diff * 0.12;
      setDisplayPct(displayPctRef.current);
      rafRef.current = requestAnimationFrame(animate);
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [targetPct]);

  return (
    <div className="hidden md:flex flex-col items-center justify-center h-full bg-(--color-elevated) gap-6">
      <div className="flex flex-col items-center gap-4">
        <div className="w-10 h-48 bg-(--color-overlay) rounded-full overflow-hidden flex flex-col-reverse border border-(--color-border-default)">
          <div style={{ height: `${displayPct}%`, width: '100%', background: 'var(--color-accent)', transition: 'none' }} />
        </div>
        <p className="text-[22px] font-(--font-mono) text-(--color-accent)">
          {parsed > 0 ? `$${parsed.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : '—'}
        </p>
      </div>
    </div>
  );
}

export function Step4AssetViz({ isLiquid }: { isLiquid: boolean }) {
  return (
    <div className="hidden md:flex flex-col items-center justify-center h-full bg-(--color-elevated) gap-8 px-10">
      <div className="flex gap-8 items-end">
        {/* Liquid */}
        <div className="flex flex-col items-center gap-3">
          <span className={`text-3xl ${isLiquid ? 'debt-type-pulse' : ''}`}>💧</span>
          <div className="w-12 h-32 bg-(--color-overlay) rounded-full overflow-hidden flex flex-col-reverse border border-(--color-border-default)">
            <div style={{ height: isLiquid ? '75%' : '20%', width: '100%', background: 'var(--color-accent)', transition: 'height 500ms ease-out' }} />
          </div>
          <p className="text-[11px] text-(--color-accent) uppercase tracking-wider">Liquid</p>
        </div>
        {/* Non-liquid */}
        <div className="flex flex-col items-center gap-3">
          <span className={`text-3xl ${!isLiquid ? 'debt-type-pulse' : ''}`}>🔒</span>
          <div className="w-12 h-32 bg-(--color-overlay) rounded-full overflow-hidden flex flex-col-reverse border border-(--color-border-default)">
            <div style={{ height: !isLiquid ? '75%' : '20%', width: '100%', background: 'var(--color-text-tertiary)', transition: 'height 500ms ease-out' }} />
          </div>
          <p className="text-[11px] text-(--color-text-tertiary) uppercase tracking-wider">Non-liquid</p>
        </div>
      </div>
    </div>
  );
}

export function Step5AssetViz({ linked }: { linked: boolean }) {
  return (
    <div className="hidden md:flex flex-col items-center justify-center h-full bg-(--color-elevated)">
      <svg width="220" height="100" viewBox="0 0 220 100">
        <line x1="60" y1="50" x2="160" y2="50"
          stroke={linked ? 'var(--color-accent)' : 'var(--color-border-strong)'}
          strokeWidth={linked ? 2.5 : 1.5}
          strokeDasharray={linked ? undefined : '6 4'}
          style={{ transition: 'stroke 400ms, stroke-width 400ms' }}
        />
        <circle cx="50" cy="50" r="28" fill="var(--color-overlay)"
          stroke="var(--color-accent)" strokeWidth="2" />
        <text x="50" y="55" textAnchor="middle" fontSize="18">🏦</text>
        <circle cx="170" cy="50" r="28" fill="var(--color-overlay)"
          stroke={linked ? 'var(--color-accent)' : 'var(--color-border-default)'}
          strokeWidth={linked ? 2 : 1}
          style={{ transition: 'stroke 400ms, stroke-width 400ms' }}
        />
        <text x="170" y="55" textAnchor="middle" fontSize="18">💳</text>
      </svg>
      <p className="text-[11px] text-(--color-text-tertiary) mt-4 uppercase tracking-widest">
        {linked ? 'Asset linked to debt' : 'Asset · Debt'}
      </p>
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export function AssetWizard({
  onSuccess, onClose, contextType, contextId, zIndex = 60, onAssetSaved,
  prefillName, prefillLinkedDebtId,
}: AssetWizardProps) {
  const [step, setStep] = useState(1);
  const [anim, setAnim] = useState<'wizard-enter-forward' | 'wizard-enter-back'>('wizard-enter-forward');
  const [phase, setPhase] = useState<'questions' | 'add-another'>('questions');
  const [savedAsset, setSavedAsset] = useState<{ id: string; name: string } | null>(null);
  const [form, setForm] = useState<AssetWizardState>({
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
          icon:           cat?.icon          ?? '📋',
          asset_type:     cat?.dbValue        ?? 'other',
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
      setSaving(false);
      setSavedAsset({ id: data.asset_id, name });
      onAssetSaved?.();
      setPhase('add-another');
    } catch {
      setSaveError('Network error — try again.');
      setSaving(false);
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0" style={{ zIndex }}>
      {phase === 'questions' && (
        <div className="grid grid-cols-1 md:grid-cols-2 h-full">

          {/* ── Left column ─────────────────────────────────────────────────── */}
          <div className="flex flex-col justify-between px-10 py-10 bg-(--color-base) overflow-y-auto">

            {/* Progress dots — 5 dots (step 6/Review has no dot) */}
            <div className="flex items-center gap-2">
              {Array.from({ length: 5 }, (_, i) => {
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

            {/* Step content */}
            <div key={step} className={`flex-1 flex flex-col justify-center py-8 ${anim}`}>

              {/* ── Step 1 — Name ────────────────────────────────────────────── */}
              {step === 1 && (
                <div className="flex flex-col gap-6">
                  <p className="text-[28px] font-bold text-(--color-text-primary)">
                    What&apos;s this asset called?
                  </p>
                  <input
                    autoFocus
                    value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    onKeyDown={e => { if (e.key === 'Enter' && form.name.trim()) advanceStep(); }}
                    placeholder="Home, Toyota Camry, Fidelity 401k..."
                    className="w-full bg-(--color-elevated) border border-(--color-border-default) rounded-xl px-5 py-4 text-[20px] text-(--color-text-primary) placeholder:text-(--color-text-tertiary) outline-none focus:border-(--color-accent)"
                  />
                </div>
              )}

              {/* ── Step 2 — Category ────────────────────────────────────────── */}
              {step === 2 && (
                <div className="flex flex-col gap-6">
                  <p className="text-[28px] font-bold text-(--color-text-primary)">
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
                        <span className="text-[22px]">{icon}</span>
                        <p className="text-[14px] font-semibold text-(--color-text-primary) mt-1">{label}</p>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Step 3 — Value ───────────────────────────────────────────── */}
              {step === 3 && (
                <div className="flex flex-col gap-5">
                  <p className="text-[28px] font-bold text-(--color-text-primary)">
                    What&apos;s it worth today?
                  </p>
                  <div className="flex items-center gap-3 bg-(--color-elevated) border border-(--color-border-default) rounded-xl px-5 py-4 focus-within:border-(--color-accent)">
                    <span className="text-[24px] text-(--color-text-tertiary)">$</span>
                    <input
                      autoFocus
                      type="number" min="0" step="0.01"
                      value={form.value}
                      onChange={e => setForm(f => ({ ...f, value: e.target.value }))}
                      placeholder="0.00"
                      className="flex-1 bg-transparent text-[24px] text-(--color-text-primary) placeholder:text-(--color-text-tertiary) outline-none"
                    />
                  </div>
                  {form.asset_type && (
                    <p className="text-[13px] text-(--color-text-secondary)">
                      {VALUE_HINTS[form.asset_type as CategoryValue]}
                      {form.asset_type === 'real_property' && (
                        <> <a href="https://www.zillow.com" target="_blank" rel="noopener noreferrer" className="text-(--color-accent) hover:opacity-80">Check Zillow →</a></>
                      )}
                      {form.asset_type === 'vehicle' && (
                        <> <a href="https://www.kbb.com" target="_blank" rel="noopener noreferrer" className="text-(--color-accent) hover:opacity-80">Check KBB →</a></>
                      )}
                    </p>
                  )}
                </div>
              )}

              {/* ── Step 4 — Liquid? ─────────────────────────────────────────── */}
              {step === 4 && (
                <div className="flex flex-col gap-5">
                  <p className="text-[28px] font-bold text-(--color-text-primary)">
                    Can you convert this to cash within a week?
                  </p>
                  <div className="flex flex-col gap-3">
                    {[
                      { value: true,  label: "Yes — it's liquid" },
                      { value: false, label: "No — it's tied up"  },
                    ].map(opt => (
                      <button
                        key={String(opt.value)}
                        onClick={() => setForm(f => ({ ...f, is_liquid: opt.value }))}
                        className={`w-full py-4 px-5 rounded-xl border text-[15px] text-left font-medium transition-all ${form.is_liquid === opt.value ? 'border-(--color-accent) bg-(--color-accent)/8 text-(--color-text-primary)' : 'border-(--color-border-default) text-(--color-text-secondary) hover:border-(--color-border-strong)'}`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  <div className="p-3 rounded-xl bg-(--color-overlay) text-[12px] text-(--color-text-secondary) leading-relaxed">
                    💡 Liquid assets (cash, stocks) count toward your investable assets — money you could deploy into a deal today. Non-liquid assets (real estate, vehicles) still count toward net worth but can&apos;t be quickly mobilized.
                  </div>
                </div>
              )}

              {/* ── Step 5 — Debt link ───────────────────────────────────────── */}
              {step === 5 && (
                <div className="flex flex-col gap-4">
                  <p className="text-[28px] font-bold text-(--color-text-primary)">
                    Is there a loan against this asset?
                  </p>
                  <p className="text-[13px] text-(--color-text-secondary)">
                    For example: a car loan against your vehicle, or a mortgage against your home. Linking them gives you an accurate net worth calculation.
                  </p>
                  {!debtChoice && (
                    <div className="flex flex-col gap-3 mt-2">
                      <button
                        onClick={() => setDebtChoice('yes')}
                        className="w-full py-3 px-5 rounded-xl border border-(--color-border-default) text-[14px] text-(--color-text-primary) hover:border-(--color-border-strong) transition-colors text-left"
                      >
                        Yes, link a debt
                      </button>
                      <button
                        onClick={advanceStep}
                        className="w-full py-3 px-5 rounded-xl border border-(--color-border-default) text-[14px] text-(--color-text-secondary) hover:text-(--color-text-primary) transition-colors text-left"
                      >
                        No, it&apos;s owned free and clear
                      </button>
                    </div>
                  )}
                  {debtChoice === 'yes' && (
                    <div className="flex flex-col gap-2 mt-2">
                      {debtsLoading && <p className="text-[13px] text-(--color-text-tertiary)">Loading debts…</p>}
                      {!debtsLoading && debts.length === 0 && (
                        <p className="text-[13px] text-(--color-text-tertiary)">No debts found. You can link one later.</p>
                      )}
                      {!debtsLoading && debts.map(debt => (
                        <button
                          key={debt.id}
                          onClick={() => { setForm(f => ({ ...f, linked_debt_id: debt.id })); advanceStep(); }}
                          className={`flex items-center justify-between p-4 rounded-xl border transition-colors text-left ${form.linked_debt_id === debt.id ? 'border-(--color-accent) bg-(--color-accent)/8' : 'border-(--color-border-default) hover:border-(--color-accent) bg-(--color-elevated)'}`}
                        >
                          <span className="text-[14px] text-(--color-text-primary)">{debt.name}</span>
                          <span className="text-[13px] font-(--font-mono) text-(--color-text-secondary)">
                            ${debt.current_balance.toLocaleString()}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ── Step 6 — Review ──────────────────────────────────────────── */}
              {step === 6 && (
                <div className="flex flex-col gap-6">
                  <p className="text-[28px] font-bold text-(--color-text-primary)">
                    Does this look right?
                  </p>
                  <div className="p-5 rounded-xl border border-(--color-border-default) bg-(--color-elevated) flex flex-col gap-4">
                    {(() => {
                      const cat = ASSET_CATEGORIES.find(c => c.value === form.asset_type);
                      const linkedDebt = debts.find(d => d.id === form.linked_debt_id);
                      return (
                        <>
                          <div className="flex items-baseline justify-between">
                            <p className="text-[24px] font-bold text-(--color-text-primary)">{form.name}</p>
                            <span className="text-[12px] px-2.5 py-1 rounded-full border border-(--color-border-default) text-(--color-text-secondary)">
                              {cat?.label ?? form.asset_type}
                            </span>
                          </div>
                          <p className="text-[32px] font-(--font-mono) font-bold text-(--color-accent)">
                            ${parseFloat(form.value || '0').toLocaleString()}
                          </p>
                          <div className="grid grid-cols-2 gap-3">
                            {([
                              ['Liquidity', form.is_liquid ? 'Liquid' : 'Non-liquid'],
                              ...(linkedDebt ? [['Linked debt', `${linkedDebt.name} ($${linkedDebt.current_balance.toLocaleString()})`]] : []),
                            ] as [string, string][]).map(([label, value]) => (
                              <div key={label}>
                                <p className="text-[10px] text-(--color-text-tertiary) uppercase tracking-[0.1em] mb-0.5">{label}</p>
                                <p className="text-[14px] font-(--font-mono) text-(--color-text-primary)">{value}</p>
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

            {/* Nav + cancel */}
            <div className="flex flex-col gap-3">
              {saveError && <p className="text-[12px] text-(--color-danger)">{saveError}</p>}
              <div className="flex gap-3">
                {step > 1 && (
                  <button
                    onClick={backStep}
                    className="flex-1 py-2.5 rounded-xl text-[14px] border border-(--color-border-default) text-(--color-text-secondary) hover:text-(--color-text-primary) transition-colors"
                  >
                    ← Back
                  </button>
                )}
                {step !== 5 && (
                  <button
                    onClick={step === 6 ? handleSave : advanceStep}
                    disabled={!stepValid || saving}
                    className="flex-1 py-2.5 rounded-xl text-[14px] font-semibold disabled:opacity-30 transition-opacity"
                    style={{ background: 'var(--color-accent)', color: 'var(--color-base)' }}
                  >
                    {step === 6 ? (saving ? 'Saving…' : 'Save asset →') : 'Continue →'}
                  </button>
                )}
                {step === 5 && debtChoice === 'yes' && (
                  <button
                    onClick={advanceStep}
                    className="flex-1 py-2.5 rounded-xl text-[14px] font-semibold transition-opacity"
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

          {/* ── Right column ─────────────────────────────────────────────────── */}
          {step === 1 && <Step1AssetViz />}
          {step === 2 && <Step2AssetViz category={form.asset_type} />}
          {step === 3 && <Step3AssetViz amount={form.value} />}
          {step === 4 && <Step4AssetViz isLiquid={form.is_liquid} />}
          {step === 5 && <Step5AssetViz linked={form.linked_debt_id !== null} />}
          {step === 6 && <Step3AssetViz amount={form.value} />}

        </div>
      )}

      {phase === 'add-another' && savedAsset && (
        <div className="h-full flex flex-col items-center justify-center bg-(--color-base) px-8 text-center gap-8">
          <svg width="64" height="64" viewBox="0 0 64 64">
            <circle
              cx="32" cy="32" r="28"
              fill="none"
              stroke="var(--color-accent)"
              strokeWidth="3"
              strokeDasharray="175.9"
              style={{ animation: 'checkCircle 500ms ease-out both' }}
            />
            <polyline
              points="18,32 28,42 46,22"
              fill="none"
              stroke="var(--color-accent)"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray="40"
              style={{ animation: 'checkTick 350ms ease-out 400ms both' }}
            />
          </svg>
          <div className="flex flex-col gap-2">
            <p className="text-[28px] font-bold text-(--color-text-primary)">{savedAsset.name} added</p>
            <p className="text-[15px] text-(--color-text-secondary)">Want to add another asset?</p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => {
                setForm({ name: '', asset_type: '', value: '', is_liquid: false, linked_debt_id: null });
                setStep(1);
                setAnim('wizard-enter-forward');
                setDebtChoice(null);
                setSaveError(null);
                setPhase('questions');
              }}
              className="px-6 py-3 rounded-xl border border-(--color-border-default) text-[14px] font-semibold text-(--color-text-primary) hover:border-(--color-border-strong) transition-colors"
            >
              + Add another
            </button>
            <button
              onClick={() => onSuccess(savedAsset.id, savedAsset.name)}
              className="px-6 py-3 rounded-xl text-[14px] font-semibold"
              style={{ background: 'var(--color-accent)', color: 'var(--color-base)' }}
            >
              I&apos;m done →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
