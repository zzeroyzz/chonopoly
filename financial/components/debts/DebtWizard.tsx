"use client";

import { useState, useEffect, useRef, useCallback } from "react";

// ─── Constants ─────────────────────────────────────────────────────────────────

const DEBT_TYPES = [
  { value: 'credit_card',   label: 'Credit Card',   icon: '💳' },
  { value: 'auto',          label: 'Auto Loan',     icon: '🚗' },
  { value: 'student_loan',  label: 'Student Loan',  icon: '🎓' },
  { value: 'personal_loan', label: 'Personal Loan', icon: '💰' },
  { value: 'mortgage',      label: 'Mortgage',      icon: '🏠' },
  { value: 'other',         label: 'Other',         icon: '📋' },
];

// ─── Utilities ─────────────────────────────────────────────────────────────────

function computePayoffMonths(balance: number, rate: number, payment: number): number | null {
  if (payment <= 0) return null;
  if (rate === 0) return balance / payment;
  const r = rate / 100 / 12;
  if (payment <= r * balance) return null;
  return -Math.log(1 - (r * balance) / payment) / Math.log(1 + r);
}

function formatMonths(n: number): string {
  const mo = Math.ceil(n);
  if (mo < 12) return `${mo} mo`;
  const yrs = Math.floor(mo / 12);
  const rem = mo % 12;
  return rem > 0 ? `${yrs}y ${rem}mo` : `${yrs}y`;
}

function payoffDate(months: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() + Math.ceil(months));
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

// ─── Types ─────────────────────────────────────────────────────────────────────

interface DebtWizardProps {
  onSuccess: (debtId: string, debtName: string) => void;
  onClose: () => void;
  contextType?: string;
  contextId?: string;
  zIndex?: number;
  onDebtSaved?: () => void;
}

interface DebtWizardState {
  name: string;
  debt_type: string;
  current_balance: string;
  original_balance: string;    // optional, defaults to current_balance on save
  interest_rate: string;
  term_months: string;         // UI-only, not sent to API
  minimum_payment: string;
  linked_bill_id: string | null;  // UI-only, not sent to API
}

interface BillOption {
  id: string;
  name: string;
  amount: number;
  recurrence: string;
}

// ─── Viz Components ────────────────────────────────────────────────────────────

export function Step1Viz() {
  const [drawKey, setDrawKey] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setDrawKey(k => k + 1), 4000);
    return () => clearInterval(id);
  }, []);
  const prefersReduced = typeof window !== 'undefined'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  return (
    <div className="hidden md:flex flex-col items-center justify-center h-full bg-(--color-elevated)">
      <svg key={prefersReduced ? 0 : drawKey} width="120" height="140" viewBox="0 0 120 140">
        <rect x="10" y="10" width="100" height="120" rx="8" ry="8"
          fill="none" stroke="var(--color-accent)" strokeWidth="2"
          strokeDasharray="360"
          className={prefersReduced ? '' : 'dash-draw'}
          style={{ '--dash-len': '360' } as React.CSSProperties}
        />
        <line x1="25" y1="50" x2="95" y2="50"
          stroke="var(--color-text-tertiary)" strokeWidth="2"
          strokeDasharray="70"
          className={prefersReduced ? '' : 'dash-draw'}
          style={{ '--dash-len': '70', animationDelay: '0.6s' } as React.CSSProperties}
        />
        <line x1="25" y1="70" x2="80" y2="70"
          stroke="var(--color-text-tertiary)" strokeWidth="2"
          strokeDasharray="55"
          className={prefersReduced ? '' : 'dash-draw'}
          style={{ '--dash-len': '55', animationDelay: '0.8s' } as React.CSSProperties}
        />
      </svg>
      <p className="text-[11px] text-(--color-text-tertiary) mt-4 uppercase tracking-widest">
        Name your debt
      </p>
    </div>
  );
}

export function Step2Viz({ debtType }: { debtType: string }) {
  const meta = DEBT_TYPES.find(d => d.value === debtType);
  return (
    <div className="hidden md:flex flex-col items-center justify-center h-full bg-(--color-elevated)">
      <div
        className={`w-32 h-32 rounded-full border-2 flex items-center justify-center transition-all duration-300 ${meta ? 'debt-type-pulse' : ''}`}
        style={{
          background: meta ? 'var(--color-accent-glow)' : 'var(--color-overlay)',
          borderColor: meta ? 'var(--color-accent)' : 'var(--color-border-default)',
        }}
      >
        {meta ? (
          <span
            key={debtType}
            className="text-5xl"
            style={{ animation: 'scaleIn 250ms ease-out forwards' }}
          >
            {meta.icon}
          </span>
        ) : (
          <span className="text-[11px] text-(--color-text-disabled) uppercase tracking-widest">Pick one</span>
        )}
      </div>
      {meta && (
        <p className="text-[13px] text-(--color-text-secondary) mt-4">{meta.label}</p>
      )}
    </div>
  );
}

export function Step3Viz({ amount }: { amount: string }) {
  const parsed = parseFloat(amount) || 0;
  const MAX = 100_000;
  const targetPct = Math.min(parsed / MAX * 100, 100);
  const displayPctRef = useRef(0);
  const [displayPct, setDisplayPct] = useState(0);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const animate = () => {
      const diff = targetPct - displayPctRef.current;
      if (Math.abs(diff) < 0.1) {
        displayPctRef.current = targetPct;
        setDisplayPct(targetPct);
        return;
      }
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
          <div
            style={{
              height: `${displayPct}%`,
              width: '100%',
              background: 'linear-gradient(to top, var(--color-accent), var(--color-danger))',
            }}
          />
        </div>
        <p className="text-[22px] font-(--font-mono) text-(--color-text-primary)">
          {parsed > 0
            ? `$${parsed.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
            : '—'}
        </p>
      </div>
    </div>
  );
}

export function Step4Viz({ rate }: { rate: string }) {
  const parsed = parseFloat(rate) || 0;
  const C = 2 * Math.PI * 54;
  const targetPct = Math.min(parsed, 100);
  const displayPctRef = useRef(0);
  const [displayPct, setDisplayPct] = useState(0);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const animate = () => {
      const diff = targetPct - displayPctRef.current;
      if (Math.abs(diff) < 0.05) {
        displayPctRef.current = targetPct;
        setDisplayPct(targetPct);
        return;
      }
      displayPctRef.current += diff * 0.12;
      setDisplayPct(displayPctRef.current);
      rafRef.current = requestAnimationFrame(animate);
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [targetPct]);

  const color = parsed < 8
    ? 'var(--color-accent)'
    : parsed < 20
      ? 'var(--color-warning)'
      : 'var(--color-danger)';

  const offset = C * (1 - displayPct / 100);

  return (
    <div className="hidden md:flex flex-col items-center justify-center h-full bg-(--color-elevated) gap-4">
      <svg width="140" height="140" viewBox="0 0 140 140">
        <circle cx="70" cy="70" r="54" fill="none"
          stroke="var(--color-overlay)" strokeWidth="10" />
        <circle cx="70" cy="70" r="54" fill="none"
          stroke={color} strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={offset}
          transform="rotate(-90 70 70)"
          style={{ transition: 'stroke 300ms' }}
        />
      </svg>
      <p className="text-[28px] font-(--font-mono) font-bold" style={{ color }}>
        {parsed > 0 ? `${parsed}%` : '—'}
      </p>
      <p className="text-[11px] text-(--color-text-tertiary)">
        {parsed >= 20 ? 'High APR' : parsed >= 8 ? 'Moderate APR' : parsed > 0 ? 'Low APR' : 'Enter rate'}
      </p>
    </div>
  );
}

export function Step5Viz({
  termMonths,
  minimumPayment,
  currentBalance,
  interestRate,
}: {
  termMonths: string;
  minimumPayment: string;
  currentBalance: string;
  interestRate: string;
}) {
  const balance = parseFloat(currentBalance) || 0;
  const rate = parseFloat(interestRate) || 0;
  const payment = parseFloat(minimumPayment) || 0;
  const term = parseInt(termMonths) || 0;

  const computedMonths = payment > 0 && balance > 0
    ? computePayoffMonths(balance, rate, payment)
    : null;

  const displayMonths = term > 0
    ? term
    : computedMonths !== null
      ? Math.ceil(computedMonths)
      : null;

  const MAX_MONTHS = 60;
  const pct = displayMonths !== null ? Math.min(displayMonths / MAX_MONTHS * 100, 100) : 0;
  const dateLabel = displayMonths !== null ? payoffDate(displayMonths) : null;

  return (
    <div className="hidden md:flex flex-col items-center justify-center h-full bg-(--color-elevated) px-10 gap-6">
      <p className="text-[11px] text-(--color-text-tertiary) uppercase tracking-widest self-start">
        Payoff timeline
      </p>
      <div className="w-full relative pb-8">
        <div className="w-full h-3 bg-(--color-overlay) rounded-full overflow-hidden">
          <div
            style={{
              height: '100%',
              width: `${pct}%`,
              background: 'var(--color-accent)',
              transition: 'width 500ms ease-out',
              borderRadius: '9999px',
            }}
          />
        </div>
        {dateLabel && (
          <div
            className="absolute flex flex-col items-center gap-1.5 mt-2"
            style={{ left: `${Math.min(pct, 96)}%`, top: '100%', transform: 'translateX(-50%)' }}
          >
            <div className="w-3 h-3 rounded-full bg-(--color-accent)" />
            <p className="text-[10px] text-(--color-accent) whitespace-nowrap">{dateLabel}</p>
          </div>
        )}
      </div>
      {displayMonths !== null ? (
        <p className="text-[22px] font-(--font-mono) text-(--color-text-primary) self-start">
          {formatMonths(displayMonths)}
        </p>
      ) : (
        <p className="text-[13px] text-(--color-text-tertiary) self-start">
          Enter payment to see timeline
        </p>
      )}
    </div>
  );
}

export function Step6Viz({ linked }: { linked: boolean }) {
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
        <text x="50" y="55" textAnchor="middle" fontSize="18">💳</text>
        <circle cx="170" cy="50" r="28" fill="var(--color-overlay)"
          stroke={linked ? 'var(--color-accent)' : 'var(--color-border-default)'}
          strokeWidth={linked ? 2 : 1}
          style={{ transition: 'stroke 400ms, stroke-width 400ms' }}
        />
        <text x="170" y="55" textAnchor="middle" fontSize="18">🧾</text>
      </svg>
      <p className="text-[11px] text-(--color-text-tertiary) mt-4 uppercase tracking-widest">
        {linked ? 'Debt linked to bill' : 'Debt · Bill'}
      </p>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────

export function DebtWizard({ onSuccess, onClose, contextType, contextId, zIndex = 60, onDebtSaved }: DebtWizardProps) {
  const [step, setStep] = useState(1);
  const [anim, setAnim] = useState<'wizard-enter-forward' | 'wizard-enter-back'>('wizard-enter-forward');
  const [form, setForm] = useState<DebtWizardState>({
    name: '',
    debt_type: '',
    current_balance: '',
    original_balance: '',
    interest_rate: '',
    term_months: '',
    minimum_payment: '',
    linked_bill_id: null,
  });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [phase, setPhase] = useState<'questions' | 'add-another'>('questions');
  const [savedDebt, setSavedDebt] = useState<{ id: string; name: string } | null>(null);
  const [bills, setBills] = useState<BillOption[]>([]);
  const [billsLoading, setBillsLoading] = useState(false);
  const [billChoice, setBillChoice] = useState<'yes' | null>(null);

  // ── Validation ──────────────────────────────────────────────────────────────
  const stepValid =
    step === 1 ? form.name.trim().length > 0 :
    step === 2 ? form.debt_type !== '' :
    step === 3 ? parseFloat(form.current_balance) > 0 :
    step === 4 ? (form.interest_rate !== '' && parseFloat(form.interest_rate) >= 0) :
    true;

  // ── Escape key ──────────────────────────────────────────────────────────────
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  // ── Bill fetch ──────────────────────────────────────────────────────────────
  const fetchBills = useCallback(async () => {
    setBillsLoading(true);
    try {
      const res = await fetch('/api/bills');
      const data = await res.json();
      setBills(data.bills ?? []);
    } finally {
      setBillsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (step === 6) fetchBills();
  }, [step, fetchBills]);

  // ── Navigation ──────────────────────────────────────────────────────────────
  function advanceStep() {
    if (step === 6) setBillChoice(null);
    setAnim('wizard-enter-forward');
    setStep(s => s + 1);
  }

  function backStep() {
    if (step === 6) setBillChoice(null);
    setAnim('wizard-enter-back');
    setStep(s => s - 1);
  }

  // ── Save ────────────────────────────────────────────────────────────────────
  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    try {
      const balance = parseFloat(form.current_balance);
      const name = form.name.trim();
      const res = await fetch('/api/debts/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          debt_type: form.debt_type,
          original_balance: form.original_balance ? parseFloat(form.original_balance) : balance,
          current_balance: balance,
          interest_rate: parseFloat(form.interest_rate),
          minimum_payment: form.minimum_payment ? parseFloat(form.minimum_payment) : 0,
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
      setSavedDebt({ id: data.debt_id, name });
      onDebtSaved?.();
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

          {/* Progress dots — 6 dots (step 7 / Review has no dot) */}
          <div className="flex items-center gap-2">
            {Array.from({ length: 6 }, (_, i) => {
              const isActive = step === i + 1;
              const isDone = step > i + 1;
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

          {/* Animated step content — key={step} triggers CSS enter animation */}
          <div key={step} className={`flex-1 flex flex-col justify-center py-8 ${anim}`}>

            {/* ── Step 1 — Name ──────────────────────────────────────────── */}
            {step === 1 && (
              <div className="flex flex-col gap-6">
                <p className="text-[28px] font-bold text-(--color-text-primary)">
                  What&apos;s this debt called?
                </p>
                <input
                  autoFocus
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  onKeyDown={e => { if (e.key === 'Enter' && form.name.trim()) advanceStep(); }}
                  placeholder="Car loan, Chase Sapphire, Student loan..."
                  className="w-full bg-(--color-elevated) border border-(--color-border-default) rounded-xl px-5 py-4 text-[20px] text-(--color-text-primary) placeholder:text-(--color-text-tertiary) outline-none focus:border-(--color-accent)"
                />
              </div>
            )}

            {/* ── Step 2 — Type ──────────────────────────────────────────── */}
            {step === 2 && (
              <div className="flex flex-col gap-6">
                <p className="text-[28px] font-bold text-(--color-text-primary)">
                  What kind of debt is this?
                </p>
                <div className="grid grid-cols-2 gap-3">
                  {DEBT_TYPES.map(({ value, label, icon }) => (
                    <button
                      key={value}
                      onClick={() => setForm(f => ({ ...f, debt_type: value }))}
                      className={`p-4 rounded-xl border text-left transition-all ${form.debt_type === value ? 'border-(--color-accent) bg-(--color-accent)/8' : 'border-(--color-border-default) hover:border-(--color-border-strong)'}`}
                    >
                      <span className="text-[22px]">{icon}</span>
                      <p className="text-[14px] font-semibold text-(--color-text-primary) mt-1">{label}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* ── Step 3 — Amount ────────────────────────────────────────── */}
            {step === 3 && (
              <div className="flex flex-col gap-5">
                <p className="text-[28px] font-bold text-(--color-text-primary)">
                  What&apos;s the current balance?
                </p>
                <div className="flex items-center gap-3 bg-(--color-elevated) border border-(--color-border-default) rounded-xl px-5 py-4 focus-within:border-(--color-accent)">
                  <span className="text-[24px] text-(--color-text-tertiary)">$</span>
                  <input
                    autoFocus
                    type="number" min="0" step="0.01"
                    value={form.current_balance}
                    onChange={e => setForm(f => ({ ...f, current_balance: e.target.value }))}
                    placeholder="0.00"
                    className="flex-1 bg-transparent text-[24px] text-(--color-text-primary) placeholder:text-(--color-text-tertiary) outline-none"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[12px] text-(--color-text-tertiary)">
                    Original balance{' '}
                    <span className="text-(--color-text-disabled)">(optional)</span>
                  </label>
                  <div className="flex items-center gap-2 bg-(--color-elevated) border border-(--color-border-default) rounded-lg px-4 py-2.5 focus-within:border-(--color-accent)">
                    <span className="text-[14px] text-(--color-text-tertiary)">$</span>
                    <input
                      type="number" min="0" step="0.01"
                      value={form.original_balance}
                      onChange={e => setForm(f => ({ ...f, original_balance: e.target.value }))}
                      placeholder="0.00"
                      className="flex-1 bg-transparent text-[14px] text-(--color-text-primary) placeholder:text-(--color-text-tertiary) outline-none"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* ── Step 4 — Interest Rate ─────────────────────────────────── */}
            {step === 4 && (
              <div className="flex flex-col gap-5">
                <p className="text-[28px] font-bold text-(--color-text-primary)">
                  What&apos;s the interest rate?
                </p>
                <div className="flex items-center gap-3 bg-(--color-elevated) border border-(--color-border-default) rounded-xl px-5 py-4 focus-within:border-(--color-accent)">
                  <input
                    autoFocus
                    type="number" min="0" max="100" step="0.01"
                    value={form.interest_rate}
                    onChange={e => setForm(f => ({ ...f, interest_rate: e.target.value }))}
                    placeholder="0.00"
                    className="flex-1 bg-transparent text-[24px] text-(--color-text-primary) placeholder:text-(--color-text-tertiary) outline-none"
                  />
                  <span className="text-[24px] text-(--color-text-tertiary)">%</span>
                </div>
                {form.interest_rate && form.current_balance && parseFloat(form.interest_rate) > 0 && (
                  <p className="text-[13px] text-(--color-text-secondary)">
                    At {form.interest_rate}%, you&apos;ll pay ~${(
                      parseFloat(form.current_balance) * parseFloat(form.interest_rate) / 100
                    ).toLocaleString(undefined, { maximumFractionDigits: 0 })} in interest this year
                  </p>
                )}
              </div>
            )}

            {/* ── Step 5 — Term & Minimum Payment ───────────────────────── */}
            {step === 5 && (
              <div className="flex flex-col gap-5">
                <p className="text-[28px] font-bold text-(--color-text-primary)">
                  How long is the term and what&apos;s the minimum payment?
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[12px] text-(--color-text-tertiary)">
                      Term <span className="text-(--color-text-disabled)">(optional)</span>
                    </label>
                    <div className="flex items-center gap-2 bg-(--color-elevated) border border-(--color-border-default) rounded-lg px-3 py-2.5 focus-within:border-(--color-accent)">
                      <input
                        autoFocus
                        type="number" min="1" step="1"
                        value={form.term_months}
                        onChange={e => setForm(f => ({ ...f, term_months: e.target.value }))}
                        placeholder="0"
                        className="flex-1 bg-transparent text-[14px] text-(--color-text-primary) placeholder:text-(--color-text-tertiary) outline-none"
                      />
                      <span className="text-[12px] text-(--color-text-tertiary)">months</span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[12px] text-(--color-text-tertiary)">
                      Min. payment <span className="text-(--color-text-disabled)">(optional)</span>
                    </label>
                    <div className="flex items-center gap-2 bg-(--color-elevated) border border-(--color-border-default) rounded-lg px-3 py-2.5 focus-within:border-(--color-accent)">
                      <span className="text-[14px] text-(--color-text-tertiary)">$</span>
                      <input
                        type="number" min="0" step="0.01"
                        value={form.minimum_payment}
                        onChange={e => setForm(f => ({ ...f, minimum_payment: e.target.value }))}
                        placeholder="0.00"
                        className="flex-1 bg-transparent text-[14px] text-(--color-text-primary) placeholder:text-(--color-text-tertiary) outline-none"
                      />
                    </div>
                  </div>
                </div>
                {(() => {
                  const balance = parseFloat(form.current_balance) || 0;
                  const rate = parseFloat(form.interest_rate) || 0;
                  const payment = parseFloat(form.minimum_payment) || 0;
                  if (!payment || !balance) return null;
                  const r = rate / 100 / 12;
                  if (rate > 0 && payment <= r * balance) {
                    return (
                      <p className="text-[12px] text-(--color-danger)">
                        Minimum payment doesn&apos;t cover interest — consider paying more.
                      </p>
                    );
                  }
                  const months = computePayoffMonths(balance, rate, payment);
                  if (!months) return null;
                  return (
                    <p className="text-[12px] text-(--color-text-secondary)">
                      At minimum payments, paid off in ~{formatMonths(months)} ({payoffDate(months)})
                    </p>
                  );
                })()}
              </div>
            )}

            {/* ── Step 6 — Link to a bill ────────────────────────────────── */}
            {step === 6 && (
              <div className="flex flex-col gap-4">
                <p className="text-[28px] font-bold text-(--color-text-primary)">
                  Is this debt tied to a recurring bill?
                </p>
                <p className="text-[13px] text-(--color-text-secondary)">
                  e.g. your auto loan tied to your monthly car payment. Linking helps track real payoff progress.
                </p>
                {!billChoice && (
                  <div className="flex flex-col gap-3 mt-2">
                    <button
                      onClick={() => setBillChoice('yes')}
                      className="w-full py-3 px-5 rounded-xl border border-(--color-border-default) text-[14px] text-(--color-text-primary) hover:border-(--color-border-strong) transition-colors text-left"
                    >
                      Yes, link a bill
                    </button>
                    <button
                      onClick={advanceStep}
                      className="w-full py-3 px-5 rounded-xl border border-(--color-border-default) text-[14px] text-(--color-text-secondary) hover:text-(--color-text-primary) transition-colors text-left"
                    >
                      No, skip this
                    </button>
                  </div>
                )}
                {billChoice === 'yes' && (
                  <div className="flex flex-col gap-2 mt-2">
                    {billsLoading && (
                      <p className="text-[13px] text-(--color-text-tertiary)">Loading bills…</p>
                    )}
                    {!billsLoading && bills.length === 0 && (
                      <p className="text-[13px] text-(--color-text-tertiary)">
                        No bills found. You can link one later.
                      </p>
                    )}
                    {!billsLoading && bills.map(bill => (
                      <button
                        key={bill.id}
                        onClick={() => {
                          setForm(f => ({ ...f, linked_bill_id: bill.id }));
                          advanceStep();
                        }}
                        className="flex items-center justify-between p-4 rounded-xl border border-(--color-border-default) hover:border-(--color-accent) bg-(--color-elevated) transition-colors text-left"
                      >
                        <span className="text-[14px] text-(--color-text-primary)">{bill.name}</span>
                        <span className="text-[13px] font-(--font-mono) text-(--color-text-secondary)">
                          ${bill.amount}/{bill.recurrence}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── Step 7 — Review ────────────────────────────────────────── */}
            {step === 7 && (
              <div className="flex flex-col gap-6">
                <p className="text-[28px] font-bold text-(--color-text-primary)">
                  Does this look right?
                </p>
                <div className="p-5 rounded-xl border border-(--color-border-default) bg-(--color-elevated) flex flex-col gap-4">
                  <div className="flex items-baseline justify-between">
                    <p className="text-[24px] font-bold text-(--color-text-primary)">{form.name}</p>
                    <span className="text-[12px] px-2.5 py-1 rounded-full border border-(--color-border-default) text-(--color-text-secondary)">
                      {DEBT_TYPES.find(d => d.value === form.debt_type)?.label ?? form.debt_type}
                    </span>
                  </div>
                  <p className="text-[32px] font-(--font-mono) font-bold text-(--color-text-primary)">
                    ${parseFloat(form.current_balance || '0').toLocaleString()}
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    {(([
                      ['Interest rate', `${form.interest_rate || '0'}%`],
                      ['Annual interest', form.interest_rate && form.current_balance
                        ? `~$${(parseFloat(form.current_balance) * parseFloat(form.interest_rate) / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}/yr`
                        : '—'],
                      ...(form.original_balance ? [['Original balance', `$${parseFloat(form.original_balance).toLocaleString()}`]] : []),
                      ...(form.term_months ? [['Term', `${form.term_months} months`]] : []),
                      ...(form.minimum_payment ? [['Min. payment', `$${parseFloat(form.minimum_payment).toLocaleString()}/mo`]] : []),
                      ...(form.linked_bill_id ? [['Linked bill', bills.find(b => b.id === form.linked_bill_id)?.name ?? 'Bill']] : []),
                    ]) as [string, string][]).map(([label, value]) => (
                      <div key={label}>
                        <p className="text-[10px] text-(--color-text-tertiary) uppercase tracking-[0.1em] mb-0.5">{label}</p>
                        <p className="text-[14px] font-(--font-mono) text-(--color-text-primary)">{value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

          </div>

          {/* Nav + cancel */}
          <div className="flex flex-col gap-3">
            {saveError && (
              <p className="text-[12px] text-(--color-danger)">{saveError}</p>
            )}
            <div className="flex gap-3">
              {step > 1 && (
                <button
                  onClick={backStep}
                  className="flex-1 py-2.5 rounded-xl text-[14px] border border-(--color-border-default) text-(--color-text-secondary) hover:text-(--color-text-primary) transition-colors"
                >
                  ← Back
                </button>
              )}
              {step !== 6 && (
                <button
                  onClick={step === 7 ? handleSave : advanceStep}
                  disabled={!stepValid || saving}
                  className="flex-1 py-2.5 rounded-xl text-[14px] font-semibold disabled:opacity-30 transition-opacity"
                  style={{ background: 'var(--color-accent)', color: 'var(--color-base)' }}
                  data-testid={step === 7 ? "wizard-debt-create-btn" : undefined}
                >
                  {step === 7 ? (saving ? 'Saving…' : 'Save debt →') : 'Continue →'}
                </button>
              )}
              {step === 6 && billChoice === 'yes' && (
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
        {step === 1 && <Step1Viz />}
        {step === 2 && <Step2Viz debtType={form.debt_type} />}
        {step === 3 && <Step3Viz amount={form.current_balance} />}
        {step === 4 && <Step4Viz rate={form.interest_rate} />}
        {step === 5 && (
          <Step5Viz
            termMonths={form.term_months}
            minimumPayment={form.minimum_payment}
            currentBalance={form.current_balance}
            interestRate={form.interest_rate}
          />
        )}
        {step === 6 && <Step6Viz linked={form.linked_bill_id !== null} />}
        {step === 7 && (
          <Step5Viz
            termMonths={form.term_months}
            minimumPayment={form.minimum_payment}
            currentBalance={form.current_balance}
            interestRate={form.interest_rate}
          />
        )}

      </div>
      )}

      {phase === 'add-another' && savedDebt && (
        <div className="h-full flex flex-col items-center justify-center bg-(--color-base) px-8 text-center gap-8">
          {/* ✓ circle */}
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
            <p className="text-[28px] font-bold text-(--color-text-primary)">{savedDebt.name} added</p>
            <p className="text-[15px] text-(--color-text-secondary)">Want to add another debt?</p>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => {
                setForm({ name: '', debt_type: '', current_balance: '', original_balance: '', interest_rate: '', term_months: '', minimum_payment: '', linked_bill_id: null });
                setStep(1);
                setAnim('wizard-enter-forward');
                setBillChoice(null);
                setSaveError(null);
                setPhase('questions');
              }}
              className="px-6 py-3 rounded-xl border border-(--color-border-default) text-[14px] font-semibold text-(--color-text-primary) hover:border-(--color-border-strong) transition-colors"
            >
              + Add another
            </button>
            <button
              onClick={() => onSuccess(savedDebt.id, savedDebt.name)}
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
