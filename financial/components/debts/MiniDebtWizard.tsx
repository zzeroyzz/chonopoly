"use client";

import { useState, useEffect, useCallback } from "react";

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

interface MiniDebtWizardProps {
  onSuccess: (debtId: string, debtName: string) => void;
  onClose: () => void;
  contextType?: string;
  contextId?: string;
}

interface DebtWizardState {
  name: string;
  debt_type: string;
  current_balance: string;
  original_balance: string;
  interest_rate: string;
  term_months: string;
  minimum_payment: string;
  linked_bill_id: string | null;
}

interface BillOption {
  id: string;
  name: string;
  amount: number;
  recurrence: string;
}

// ─── Component ─────────────────────────────────────────────────────────────────

export function MiniDebtWizard({ onSuccess, onClose, contextType, contextId }: MiniDebtWizardProps) {
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
    try {
      const balance = parseFloat(form.current_balance);
      const res = await fetch('/api/debts/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          debt_type: form.debt_type,
          original_balance: form.original_balance ? parseFloat(form.original_balance) : balance,
          current_balance: balance,
          interest_rate: parseFloat(form.interest_rate),
          minimum_payment: form.minimum_payment ? parseFloat(form.minimum_payment) : 0,
          ...(contextType ? { context_type: contextType, context_id: contextId } : {}),
        }),
      });
      const data = await res.json();
      if (data.debt_id) onSuccess(data.debt_id, form.name.trim());
      else onClose();
    } catch {
      setSaving(false);
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-[6px]" />
      <div
        className="relative bg-(--color-elevated) border border-(--color-border-default) rounded-xl w-full max-w-lg mx-4 p-6 flex flex-col gap-5 max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >

        {/* Progress dots — 6 dots (Review has no dot) */}
        <div className="flex items-center justify-center gap-2">
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

        {/* Animated step content */}
        <div key={step} className={anim}>

          {/* ── Step 1 — Name ──────────────────────────────────────────────── */}
          {step === 1 && (
            <div className="flex flex-col gap-5">
              <p className="text-[22px] font-bold text-(--color-text-primary)">
                What&apos;s this debt called?
              </p>
              <input
                autoFocus
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                onKeyDown={e => { if (e.key === 'Enter' && form.name.trim()) advanceStep(); }}
                placeholder="Car loan, Chase Sapphire, Student loan..."
                className="w-full bg-(--color-base) border border-(--color-border-default) rounded-xl px-4 py-3 text-[16px] text-(--color-text-primary) placeholder:text-(--color-text-tertiary) outline-none focus:border-(--color-accent)"
              />
            </div>
          )}

          {/* ── Step 2 — Type ──────────────────────────────────────────────── */}
          {step === 2 && (
            <div className="flex flex-col gap-5">
              <p className="text-[22px] font-bold text-(--color-text-primary)">
                What kind of debt is this?
              </p>
              <div className="grid grid-cols-2 gap-3">
                {DEBT_TYPES.map(({ value, label, icon }) => (
                  <button
                    key={value}
                    onClick={() => setForm(f => ({ ...f, debt_type: value }))}
                    className={`p-4 rounded-xl border text-left transition-all ${form.debt_type === value ? 'border-(--color-accent) bg-(--color-accent)/8' : 'border-(--color-border-default) hover:border-(--color-border-strong)'}`}
                  >
                    <span className="text-[20px]">{icon}</span>
                    <p className="text-[13px] font-semibold text-(--color-text-primary) mt-1">{label}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── Step 3 — Amount ────────────────────────────────────────────── */}
          {step === 3 && (
            <div className="flex flex-col gap-4">
              <p className="text-[22px] font-bold text-(--color-text-primary)">
                What&apos;s the current balance?
              </p>
              <div className="flex items-center gap-2 bg-(--color-base) border border-(--color-border-default) rounded-xl px-4 py-3 focus-within:border-(--color-accent)">
                <span className="text-[18px] text-(--color-text-tertiary)">$</span>
                <input
                  autoFocus
                  type="number" min="0" step="0.01"
                  value={form.current_balance}
                  onChange={e => setForm(f => ({ ...f, current_balance: e.target.value }))}
                  placeholder="0.00"
                  className="flex-1 bg-transparent text-[18px] text-(--color-text-primary) placeholder:text-(--color-text-tertiary) outline-none"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[12px] text-(--color-text-tertiary)">
                  Original balance{' '}
                  <span className="text-(--color-text-disabled)">(optional)</span>
                </label>
                <div className="flex items-center gap-2 bg-(--color-base) border border-(--color-border-default) rounded-lg px-3 py-2.5 focus-within:border-(--color-accent)">
                  <span className="text-[13px] text-(--color-text-tertiary)">$</span>
                  <input
                    type="number" min="0" step="0.01"
                    value={form.original_balance}
                    onChange={e => setForm(f => ({ ...f, original_balance: e.target.value }))}
                    placeholder="0.00"
                    className="flex-1 bg-transparent text-[13px] text-(--color-text-primary) placeholder:text-(--color-text-tertiary) outline-none"
                  />
                </div>
              </div>
            </div>
          )}

          {/* ── Step 4 — Interest Rate ─────────────────────────────────────── */}
          {step === 4 && (
            <div className="flex flex-col gap-4">
              <p className="text-[22px] font-bold text-(--color-text-primary)">
                What&apos;s the interest rate?
              </p>
              <div className="flex items-center gap-2 bg-(--color-base) border border-(--color-border-default) rounded-xl px-4 py-3 focus-within:border-(--color-accent)">
                <input
                  autoFocus
                  type="number" min="0" max="100" step="0.01"
                  value={form.interest_rate}
                  onChange={e => setForm(f => ({ ...f, interest_rate: e.target.value }))}
                  placeholder="0.00"
                  className="flex-1 bg-transparent text-[18px] text-(--color-text-primary) placeholder:text-(--color-text-tertiary) outline-none"
                />
                <span className="text-[18px] text-(--color-text-tertiary)">%</span>
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

          {/* ── Step 5 — Term & Minimum Payment ───────────────────────────── */}
          {step === 5 && (
            <div className="flex flex-col gap-4">
              <p className="text-[22px] font-bold text-(--color-text-primary)">
                Term and minimum payment
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[12px] text-(--color-text-tertiary)">
                    Term <span className="text-(--color-text-disabled)">(optional)</span>
                  </label>
                  <div className="flex items-center gap-2 bg-(--color-base) border border-(--color-border-default) rounded-lg px-3 py-2.5 focus-within:border-(--color-accent)">
                    <input
                      autoFocus
                      type="number" min="1" step="1"
                      value={form.term_months}
                      onChange={e => setForm(f => ({ ...f, term_months: e.target.value }))}
                      placeholder="0"
                      className="flex-1 bg-transparent text-[13px] text-(--color-text-primary) placeholder:text-(--color-text-tertiary) outline-none"
                    />
                    <span className="text-[11px] text-(--color-text-tertiary)">mo</span>
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[12px] text-(--color-text-tertiary)">
                    Min. payment <span className="text-(--color-text-disabled)">(optional)</span>
                  </label>
                  <div className="flex items-center gap-2 bg-(--color-base) border border-(--color-border-default) rounded-lg px-3 py-2.5 focus-within:border-(--color-accent)">
                    <span className="text-[13px] text-(--color-text-tertiary)">$</span>
                    <input
                      type="number" min="0" step="0.01"
                      value={form.minimum_payment}
                      onChange={e => setForm(f => ({ ...f, minimum_payment: e.target.value }))}
                      placeholder="0.00"
                      className="flex-1 bg-transparent text-[13px] text-(--color-text-primary) placeholder:text-(--color-text-tertiary) outline-none"
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

          {/* ── Step 6 — Link to a bill ────────────────────────────────────── */}
          {step === 6 && (
            <div className="flex flex-col gap-4">
              <p className="text-[22px] font-bold text-(--color-text-primary)">
                Is this debt tied to a recurring bill?
              </p>
              <p className="text-[13px] text-(--color-text-secondary)">
                e.g. your auto loan tied to your monthly car payment. Linking helps track real payoff progress.
              </p>
              {!billChoice && (
                <div className="flex flex-col gap-2 mt-1">
                  <button
                    onClick={() => setBillChoice('yes')}
                    className="w-full py-3 px-4 rounded-xl border border-(--color-border-default) text-[14px] text-(--color-text-primary) hover:border-(--color-border-strong) transition-colors text-left"
                  >
                    Yes, link a bill
                  </button>
                  <button
                    onClick={advanceStep}
                    className="w-full py-3 px-4 rounded-xl border border-(--color-border-default) text-[14px] text-(--color-text-secondary) hover:text-(--color-text-primary) transition-colors text-left"
                  >
                    No, skip this
                  </button>
                </div>
              )}
              {billChoice === 'yes' && (
                <div className="flex flex-col gap-2 mt-1">
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
                      className="flex items-center justify-between p-3 rounded-xl border border-(--color-border-default) hover:border-(--color-accent) bg-(--color-base) transition-colors text-left"
                    >
                      <span className="text-[13px] text-(--color-text-primary)">{bill.name}</span>
                      <span className="text-[12px] font-(--font-mono) text-(--color-text-secondary)">
                        ${bill.amount}/{bill.recurrence}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Step 7 — Review ────────────────────────────────────────────── */}
          {step === 7 && (
            <div className="flex flex-col gap-5">
              <p className="text-[22px] font-bold text-(--color-text-primary)">
                Does this look right?
              </p>
              <div className="p-4 rounded-xl border border-(--color-border-default) bg-(--color-base) flex flex-col gap-4">
                <div className="flex items-baseline justify-between">
                  <p className="text-[20px] font-bold text-(--color-text-primary)">{form.name}</p>
                  <span className="text-[11px] px-2 py-0.5 rounded-full border border-(--color-border-default) text-(--color-text-secondary)">
                    {DEBT_TYPES.find(d => d.value === form.debt_type)?.label ?? form.debt_type}
                  </span>
                </div>
                <p className="text-[26px] font-(--font-mono) font-bold text-(--color-text-primary)">
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
                      <p className="text-[13px] font-(--font-mono) text-(--color-text-primary)">{value}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

        </div>

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
            {step !== 6 && (
              <button
                onClick={step === 7 ? handleSave : advanceStep}
                disabled={!stepValid || saving}
                className="flex-1 py-2.5 rounded-xl text-[13px] font-semibold disabled:opacity-30 transition-opacity"
                style={{ background: 'var(--color-accent)', color: 'var(--color-base)' }}
                data-testid={step === 7 ? "wizard-debt-create-btn" : undefined}
              >
                {step === 7 ? (saving ? 'Saving…' : 'Save debt →') : 'Continue →'}
              </button>
            )}
            {step === 6 && billChoice === 'yes' && (
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
