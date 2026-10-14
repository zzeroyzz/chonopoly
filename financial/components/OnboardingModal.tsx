"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Building2, Check, ChevronDown, ChevronUp } from "lucide-react";
import { ActiveContext } from "@/lib/goals/types";
import { formatMoney, Transaction, getCategoryMeta } from "@/components/budget/types";
import { PlaidConnectButton } from "@/components/budget/PlaidConnectButton";
import type { Bill } from "@/components/bills/BillsWidget";
import { BillWizard } from "@/components/bills/BillWizard";
import { DebtWizard } from "@/components/debts/DebtWizard";
import type { DebtSummary } from "@/lib/debts/types";
import { AssetWizard } from "@/components/assets/AssetWizard";
import type { AssetSummary } from "@/lib/assets/types";
import { FullScreenGoalWizard } from "@/components/goals/FullScreenGoalWizard";
import type { GoalSummary } from "@/lib/goals/types";

interface OnboardingState {
  connected_bank: boolean;
  added_savings_goal: boolean;
  added_debt: boolean;
  added_asset: boolean;
  set_up_budget: boolean;
  dismissed_at: string | null;
}

const STEPS: { key: keyof Omit<OnboardingState, "dismissed_at">; label: string; description: string; view: string }[] = [
  { key: "connected_bank",     label: "Connect your bank",         description: "Link your bank account to track real balances and transactions.",      view: "overview" },
  { key: "added_savings_goal", label: "Set a savings goal",        description: "Tell us what you're saving toward — a home, vacation, emergency fund.", view: "goals" },
  { key: "added_debt",         label: "Tell us what you owe",      description: "Add your credit cards and loans to track payoff progress.",             view: "debts" },
  { key: "added_asset",        label: "Add what you own",          description: "Track your car, home, or investments to see your true net worth.",       view: "debts" },
  { key: "set_up_budget",      label: "Create your first budget",  description: "Set spending limits so your money goes where you want it to.",           view: "budgets" },
];

// ─── Shared helpers ───────────────────────────────────────────────────────────

function avatarColor(name: string): string {
  const colors = [
    "bg-blue-500/20 text-blue-400",
    "bg-purple-500/20 text-purple-400",
    "bg-emerald-500/20 text-emerald-400",
    "bg-orange-500/20 text-orange-400",
    "bg-pink-500/20 text-pink-400",
    "bg-cyan-500/20 text-cyan-400",
    "bg-yellow-500/20 text-yellow-400",
    "bg-indigo-500/20 text-indigo-400",
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

// ─── Onboarding answer types ──────────────────────────────────────────────────

interface OnboardingDebt {
  name: string;
  type: string;
  balance: number;
  interest_rate: number;
  minimum_payment: number;
}

interface OnboardingAsset {
  name: string;
  type: string;
  value: number;
}

interface OnboardingAnswers {
  confirmedBills: Bill[]; // already in DB from sync — tracked only, not re-posted
  taggedMerchants: string[];
  manualBills: Array<{ name: string; amount: number; recurrence: string; due_day: number }>;
  goalName: string;
  goalTarget: number | null;
  goalTargetDate: string | null;
  goalIcon: string;
  debts: OnboardingDebt[];
  assets: OnboardingAsset[];
}

interface StepPanelProps {
  answers: OnboardingAnswers;
  updateAnswers: (updates: Partial<OnboardingAnswers>) => void;
  onBack: () => void;
  onContinue: () => void;
}

interface Step3Props extends StepPanelProps {
  activeContext: ActiveContext;
}

interface Step4Props extends StepPanelProps {
  activeContext: ActiveContext;
}

interface Step5Props extends StepPanelProps {
  activeContext: ActiveContext;
}

interface MerchantGroup {
  merchant: string; // display name and plaid_merchant value
  amount: number;   // most recent transaction amount
  count: number;    // total occurrences in the window
  due_day: number;  // day-of-month from the most recent transaction date
  recentDate: string; // ISO date of most recent transaction (e.g. "2026-06-07")
}

interface Props {
  activeContext: ActiveContext;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onNavigate: (view: any) => void;
  onComplete: () => void;
}

// ─── Step 1 panel ─────────────────────────────────────────────────────────────

function Step1Panel({
  onSuccess,
  step1Success,
  revealPhase,
  syncedTransactions,
  transactionCount,
  onContinue,
  isAlreadyConnected,
  connectedBankName,
}: {
  onSuccess: () => void;
  step1Success: boolean;
  revealPhase: 'syncing' | 'complete' | 'revealed';
  syncedTransactions: Transaction[];
  transactionCount: number;
  onContinue: () => void;
  isAlreadyConnected: boolean;
  connectedBankName: string | null;
}) {
  return (
    <div className="grid w-full h-full grid-cols-1 md:grid-cols-2">
      {/* md:grid-cols-2 replaces removed inline style: gridTemplateColumns '1fr 1fr' */}

      {/* Left — preview (hidden on mobile, shown md+) */}
      <div className="relative bg-(--color-elevated) flex flex-col justify-center px-8 md:px-12 py-8 max-md:hidden">
        {/* PREVIEW watermark */}
        <span
          className="absolute inset-0 flex items-center justify-center text-[80px] font-bold select-none pointer-events-none"
          style={{ color: "var(--color-text-primary)", opacity: 0.03, transform: "rotate(-30deg)" }}
          aria-hidden
        >
          PREVIEW
        </span>

        <div className="flex flex-col gap-4 w-full">
          {/* Net worth banner */}
          <div style={{ animation: "fadeSlideUp 600ms ease-out both", animationDelay: "100ms" }}>
            <p className="text-[10px] uppercase tracking-widest text-(--color-text-tertiary)">Net Worth (Preview)</p>
            <p className="text-[32px] font-bold text-(--color-text-primary) leading-tight">$24,850.00</p>
            <p className="text-[12px] text-(--color-accent)">↑ $320 this month</p>
          </div>

          {/* SVG sparkline */}
          <div className="flex justify-center" style={{ animation: "fadeSlideUp 600ms ease-out both", animationDelay: "350ms" }}>
            <svg width="100%" height="200" viewBox="0 0 400 160">
              <polyline
                points="0,130 67,100 133,112 200,55 267,75 333,30 400,45"
                fill="none"
                stroke="var(--color-accent)"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray="600"
                style={{ animation: "drawLine 1200ms ease-out both", animationDelay: "500ms" }}
              />
              {([[0,130],[67,100],[133,112],[200,55],[267,75],[333,30],[400,45]] as [number,number][]).map(([x, y], i) => (
                <circle
                  key={i}
                  cx={x} cy={y} r="5"
                  fill="var(--color-accent)"
                  style={{ animation: "fadeSlideUp 300ms ease-out both", animationDelay: `${800 + i * 120}ms` }}
                />
              ))}
            </svg>
          </div>

          {/* Mock transactions */}
          {[
            { emoji: "🍔", merchant: "McDonald's",        category: "Food & Drink",   amount: "-$12.40" },
            { emoji: "🚗", merchant: "Shell Gas Station",  category: "Transportation", amount: "-$45.00" },
            { emoji: "🛒", merchant: "Walmart",            category: "Shopping",       amount: "-$67.23" },
          ].map((tx, i) => (
            <div
              key={i}
              className="hidden md:flex items-center gap-3"
              style={{ animation: "fadeSlideRight 500ms ease-out both", animationDelay: `${900 + i * 200}ms` }}
            >
              <span className="w-7 h-7 rounded-full bg-(--color-overlay) flex items-center justify-center text-[14px] shrink-0">{tx.emoji}</span>
              <span className="text-[12px] text-(--color-text-primary) flex-1 truncate">{tx.merchant}</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-(--color-border-default) text-(--color-text-secondary)">{tx.category}</span>
              <span className="text-[12px] font-(--font-mono) text-(--color-danger) shrink-0">{tx.amount}</span>
            </div>
          ))}

          {/* Caption */}
          <p
            className="hidden md:block text-[11px] text-(--color-text-tertiary) text-center"
            style={{ animation: "fadeSlideUp 500ms ease-out both", animationDelay: "1500ms" }}
          >
            Your real data will look like this
          </p>
        </div>
      </div>

      {/* Right — action */}
      <div className="flex flex-col justify-center px-8 md:px-12 py-8 overflow-y-auto">
        {step1Success ? (
          revealPhase === 'revealed' ? (

            <div className="flex flex-col gap-3 w-full">
              <p className="text-[12px] text-(--color-text-tertiary) mb-3">Here&apos;s a preview of what we found:</p>
              {syncedTransactions.map((tx, i) => {
                const merchant = tx.merchant_name ?? tx.name ?? 'Unknown';
                const isCredit = tx.amount < 0;
                const display = `${isCredit ? '+' : '-'}$${Math.abs(tx.amount).toFixed(2)}`;
                const meta = getCategoryMeta(tx.personal_finance_category?.primary);
                return (
                  <div
                    key={tx.transaction_id}
                    className="flex items-center gap-3 bg-(--color-elevated) border border-(--color-border-default) rounded-md px-4 py-3"
                    style={{ animation: 'fadeSlideUp 400ms ease-out both', animationDelay: `${i * 150}ms` }}
                  >
                    <span className="w-8 h-8 rounded-full bg-(--color-overlay) flex items-center justify-center text-[13px] font-bold text-(--color-accent) shrink-0">
                      {merchant.charAt(0).toUpperCase()}
                    </span>
                    <span className="text-[13px] font-medium text-(--color-text-primary) flex-1 truncate">{merchant}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-(--color-overlay) text-(--color-text-secondary) shrink-0">
                      {meta.label}
                    </span>
                    <span className={`text-[13px] font-(--font-mono) shrink-0 ${isCredit ? 'text-(--color-success)' : 'text-(--color-danger)'}`}>
                      {display}
                    </span>
                  </div>
                );
              })}
              {syncedTransactions.length === 0 && (
                <p className="text-[13px] text-(--color-text-secondary) text-center py-4">No recent transactions found.</p>
              )}
              <button
                onClick={onContinue}
                className="w-full mt-4 px-4 py-3 rounded-md text-[14px] font-semibold transition-all"
                style={{
                  background: 'var(--color-accent)',
                  color: 'var(--color-base)',
                  animation: 'fadeSlideUp 400ms ease-out both',
                  animationDelay: '800ms',
                }}
              >
                Continue →
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center text-center gap-4">
              <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
                <circle
                  cx="32" cy="32" r="28"
                  stroke="var(--color-accent)" strokeWidth="3" fill="none"
                  strokeDasharray="200"
                  style={{ animation: "checkCircle 400ms ease-out both" }}
                />
                <path
                  d="M20 32 L28 40 L44 24"
                  stroke="var(--color-accent)" strokeWidth="3"
                  strokeLinecap="round" strokeLinejoin="round"
                  strokeDasharray="50"
                  style={{ animation: "checkTick 300ms ease-out both", animationDelay: "300ms" }}
                />
              </svg>
              <p className="text-[20px] font-bold text-(--color-text-primary)">Bank connected!</p>
              <p className="text-[13px] text-(--color-text-secondary)">
                {revealPhase === 'complete' ? `Found ${transactionCount} transactions` : 'Syncing your transactions...'}
              </p>
              <div className="w-full h-1 rounded-full bg-(--color-border-default) overflow-hidden">
                {revealPhase === 'complete' ? (
                  <div
                    className="h-full bg-(--color-accent) rounded-full"
                    style={{ width: '100%', transition: 'width 400ms ease-out' }}
                  />
                ) : (
                  <div
                    className="h-full bg-(--color-accent) rounded-full"
                    style={{ width: "40%", animation: "indeterminate 1.5s ease-in-out infinite" }}
                  />
                )}
              </div>
            </div>
          )
        ) : isAlreadyConnected ? (
          <div className="flex flex-col gap-5">
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
                style={{ background: 'var(--color-accent-glow)', border: '1px solid var(--color-accent)' }}
              >
                <Check size={18} className="text-(--color-accent)" />
              </div>
              <div>
                <p className="text-[15px] font-semibold text-(--color-text-primary)">{connectedBankName ?? 'Your bank'}</p>
                <p className="text-[12px] text-(--color-accent)">Connected</p>
              </div>
            </div>
            <PlaidConnectButton onSuccess={onSuccess} variant="ghost" />
            <button
              onClick={onContinue}
              className="w-full px-4 py-3 rounded-md text-[14px] font-semibold transition-all"
              style={{ background: 'var(--color-accent)', color: 'var(--color-base)' }}
            >
              Continue →
            </button>
          </div>
        ) : (
          <div>
            <Building2 size={40} className="text-(--color-accent) mb-4" />
            <p className="text-[28px] font-bold text-(--color-text-primary) mb-3">Connect your bank</p>
            <p className="text-[14px] text-(--color-text-secondary) leading-relaxed mb-6 max-w-90">
              Link your bank account so Park Properties Finance can track your spending, income, and net worth automatically.
              Your credentials are never stored — we use Plaid, the same technology trusted by Coinbase, Venmo, and American Express.
            </p>
            {/* TODO: give PlaidConnectButton a size/variant prop for prominent CTA styling */}
            <PlaidConnectButton onSuccess={onSuccess} />
            <p className="text-[11px] text-(--color-text-tertiary) mt-4">
              🔒 256-bit encryption · Read-only access · Never stores credentials
            </p>
          </div>
        )}
      </div>

    </div>
  );
}

// ─── Step navigation bar ──────────────────────────────────────────────────────

function StepNav({
  onBack,
  onContinue,
  continueLabel = 'Continue →',
  showBack = true,
  continueDisabled = false,
}: {
  onBack: () => void;
  onContinue: () => void;
  continueLabel?: string;
  showBack?: boolean;
  continueDisabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between pt-4 border-t border-(--color-border-subtle)">
      {showBack ? (
        <button
          onClick={onBack}
          className="text-[13px] text-(--color-text-tertiary) hover:text-(--color-text-primary) transition-colors"
        >
          ← Back
        </button>
      ) : <div />}
      <button
        onClick={onContinue}
        disabled={continueDisabled}
        className="px-5 py-2.5 rounded-md text-[13px] font-semibold disabled:opacity-40 transition-all"
        style={{ background: 'var(--color-accent)', color: 'var(--color-base)' }}
      >
        {continueLabel}
      </button>
    </div>
  );
}

// ─── Step 2 — Tag bills from transactions ─────────────────────────────────────

const SKIP_CATEGORIES = new Set(['TRANSFER_IN', 'TRANSFER_OUT', 'INCOME', 'BANK_FEES']);

function groupByMerchant(transactions: Transaction[]): MerchantGroup[] {
  const map = new Map<string, { amounts: number[]; dates: string[] }>();
  for (const tx of transactions) {
    if (tx.amount <= 0) continue;
    if (tx.personal_finance_category && SKIP_CATEGORIES.has(tx.personal_finance_category.primary)) continue;
    const key = tx.merchant_name ?? tx.name;
    if (!key || key.trim() === '') continue;
    const entry = map.get(key) ?? { amounts: [], dates: [] };
    entry.amounts.push(tx.amount);
    entry.dates.push(tx.date);
    map.set(key, entry);
  }
  return Array.from(map.entries())
    .map(([merchant, { amounts, dates }]) => ({
      merchant,
      amount: amounts[0],
      count: amounts.length,
      due_day: new Date(dates[0] + 'T00:00:00').getDate(),
      recentDate: dates[0],
    }))
    .sort((a, b) => b.count - a.count);
}

function formatShortDate(isoDate: string): string {
  return new Date(isoDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function CountingAmount() {
  const [animState, setAnimState] = useState<{ value: number; t: number; done: boolean }>(
    { value: 0, t: 0, done: false }
  );

  useEffect(() => {
    const TARGET = 1232.98;
    const DURATION = 2800;
    const DELAY = 300;
    let rafId = 0;
    let startTime: number | null = null;

    const timeoutId = setTimeout(() => {
      function tick(now: number) {
        if (startTime === null) startTime = now;
        const elapsed = now - startTime;
        const t = Math.min(elapsed / DURATION, 1);
        const progress = 1 - Math.pow(1 - t, 3);
        if (t < 1) {
          setAnimState({ value: TARGET * progress, t, done: false });
          rafId = requestAnimationFrame(tick);
        } else {
          setAnimState({ value: TARGET, t: 1, done: true });
        }
      }
      rafId = requestAnimationFrame(tick);
    }, DELAY);

    return () => {
      clearTimeout(timeoutId);
      cancelAnimationFrame(rafId);
    };
  }, []);

  const { value, t, done } = animState;

  if (done) {
    return <p className="text-[28px] font-bold text-(--color-text-primary) mb-4">$1,232.98</p>;
  }

  // Color: #ffffff → #ef4444 → #ffffff at t=0, 0.5, 1
  let r: number, g: number, b: number;
  if (t <= 0.5) {
    const local = t / 0.5;
    r = Math.round(255 + (239 - 255) * local);
    g = Math.round(255 + (68  - 255) * local);
    b = Math.round(255 + (68  - 255) * local);
  } else {
    const local = (t - 0.5) / 0.5;
    r = Math.round(239 + (255 - 239) * local);
    g = Math.round(68  + (255 - 68)  * local);
    b = Math.round(68  + (255 - 68)  * local);
  }

  // Scale instead of font-size so layout never reflows
  const scale = t < 0.85
    ? (20 + (t / 0.85) * 8) / 28
    : (28 - ((t - 0.85) / 0.15) * 4) / 28;

  const whole = Math.floor(value);
  const cents = Math.floor((value % 1) * 100);
  const formatted = `$${whole.toLocaleString('en-US')}.${String(cents).padStart(2, '0')}`;

  return (
    <p className="text-[28px] font-bold mb-4" style={{ color: `rgb(${r},${g},${b})`, transform: `scale(${scale})`, transformOrigin: 'left center' }}>
      {formatted}
    </p>
  );
}

function Step2LeftPanel() {
  return (
    <div className="bg-(--color-elevated) flex flex-col  p-10 gap-12">
      <div className="flex flex-col justify-start gap-4 py-3">
        <p
          className="text-[11px] uppercase tracking-[0.12em] font-semibold text-(--color-accent)"
          style={{ animation: 'fadeSlideUp 500ms ease-out both', animationDelay: '200ms' }}
        >
          YOUR RECURRING CHARGES
        </p>
        <p
          className="text-[38px] font-bold leading-[1.2] text-(--color-text-primary) max-w-[320px]"
          style={{ animation: 'fadeSlideUp 500ms ease-out both', animationDelay: '350ms' }}
        >
          Find your bills.
        </p>
        <p
          className="text-[18px] font-normal leading-relaxed text-(--color-text-secondary) "
          style={{ animation: 'fadeSlideUp 500ms ease-out both', animationDelay: '500ms' }}
        >
          Most people are paying for 3–4 things they forgot about. Tap anything that repeats on the right to mark it as a bill — we&apos;ll track it automatically from here on out.
        </p>
        </div>
        <div className="flex flex-col items-center">
      <div
        className="bg-(--color-base) border border-(--color-border-default) rounded-xl p-6 flex flex-col max-w-lg  align-center"
        style={{ overflow: 'visible', animation: 'scaleIn 400ms ease-out both', animationDelay: '100ms' }}
      >
        <p className="text-[11px] text-(--color-text-tertiary) uppercase tracking-widest mb-0.5">Bills this month</p>
        <CountingAmount />
        {/* Rent row */}
        <div
          className="flex flex-col border-t border-(--color-border-subtle)"
          style={{ animation: 'slideInLeft 400ms ease-out both', animationDelay: '400ms' }}
        >
          <div
            style={{ background: 'var(--color-accent)', height: '2px', opacity: 1, transformOrigin: 'left', animationName: 'sweepUnderline', animationDuration: '400ms', animationTimingFunction: 'ease-out', animationFillMode: 'both', animationDelay: '1100ms' }}
          />
          <div className="grid items-center gap-x-3 py-6" style={{ gridTemplateColumns: '36px 1fr 90px 90px' }}>
            <div className="w-9 h-9 rounded-full bg-green-500/15 text-green-400 text-[11px] font-bold flex items-center justify-center">R</div>
            <div className="flex items-center gap-1.5 min-w-0">
              <p className="text-[14px] font-medium text-(--color-text-primary) truncate">Rent</p>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-(--color-accent)/10 text-(--color-accent) font-semibold shrink-0">2×</span>
            </div>
            <p className="text-[14px] font-(--font-mono) text-(--color-text-primary) text-right">$1,200.00</p>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-(--color-warning)/10 text-(--color-warning) text-center">Due Jun 1</span>
          </div>
          <div
            style={{ background: 'var(--color-accent)', height: '2px', opacity: 1, transformOrigin: 'left', animationName: 'sweepUnderline', animationDuration: '400ms', animationTimingFunction: 'ease-out', animationFillMode: 'both', animationDelay: '1300ms' }}
          />
        </div>
        {/* Xbox Game Pass row */}
        <div
          className="grid items-center gap-x-3 py-6 border-t border-(--color-border-subtle)"
          style={{ gridTemplateColumns: '36px 1fr 90px 90px', animation: 'slideInLeft 400ms ease-out both', animationDelay: '600ms' }}
        >
          <div className="w-9 h-9 rounded-full bg-blue-900/40 text-blue-300 text-[11px] font-bold flex items-center justify-center">X</div>
          <div className="flex items-center gap-1.5 min-w-0">
            <p className="text-[14px] font-medium text-(--color-text-primary) truncate">Xbox Game Pass</p>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-(--color-accent)/10 text-(--color-accent) font-semibold shrink-0">3×</span>
          </div>
          <p className="text-[14px] font-(--font-mono) text-(--color-text-primary) text-right">$14.99</p>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-(--color-success)/10 text-(--color-success) text-center">Paid</span>
        </div>
        <div
          style={{ background: 'var(--color-accent)', height: '2px', opacity: 1, transformOrigin: 'left', animationName: 'sweepUnderline', animationDuration: '400ms', animationTimingFunction: 'ease-out', animationFillMode: 'both', animationDelay: '1500ms' }}
        />
        {/* PlayStation Plus row */}
        <div
          className="grid items-center gap-x-3 py-6 border-t border-(--color-border-subtle)"
          style={{ gridTemplateColumns: '36px 1fr 90px 90px', animation: 'slideInLeft 400ms ease-out both', animationDelay: '800ms' }}
        >
          <div className="w-9 h-9 rounded-full bg-blue-500/15 text-blue-400 text-[11px] font-bold flex items-center justify-center">P</div>
          <div className="flex items-center gap-1.5 min-w-0">
            <p className="text-[14px] font-medium text-(--color-text-primary) truncate">PlayStation Plus</p>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-(--color-accent)/10 text-(--color-accent) font-semibold shrink-0">4×</span>
          </div>
          <p className="text-[14px] font-(--font-mono) text-(--color-text-primary) text-right">$17.99</p>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-(--color-danger)/10 text-(--color-danger) text-center">Overdue</span>
        </div>
        <p
          className="text-[12px] leading-relaxed text-(--color-text-tertiary)"
          style={{ animation: 'fadeSlideUp 500ms ease-out both', animationDelay: '650ms' }}
        >
          💡 The 2×, 3×, 4× badges mean that charge repeated this month. Those are your best leads.
        </p>
      </div>
</div>
    </div>
  );
}

function Step2Panel({ answers, updateAnswers, onBack, onContinue }: StepPanelProps) {
  const [txGroups, setTxGroups] = useState<MerchantGroup[]>([]);
  const [tagged, setTagged] = useState<Set<string>>(() => new Set(answers.taggedMerchants ?? []));
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);
  const [loadingMore, setLoadingMore] = useState(false);
  const [phase, setPhase] = useState<'tagging' | 'frequency' | 'saving' | 'confirmed'>('tagging');
  const [frequencies, setFrequencies] = useState<Record<string, string>>({});
  const [savedBills, setSavedBills] = useState<Bill[]>([]);
  const [showManualForm, setShowManualForm] = useState(false);
  const [manualSaved, setManualSaved] = useState<Array<{ name: string; amount: number; recurrence: string; due_day: number }>>([]);
  const existingMerchantsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    Promise.all([
      fetch('/api/plaid/transactions?days=30').then(r => r.json()).catch(() => ({ transactions: [] })),
      fetch('/api/bills').then(r => r.json()).catch(() => ({ bills: [] })),
    ]).then(([txData, billsData]) => {
      existingMerchantsRef.current = new Set<string>(
        (billsData.bills ?? [])
          .map((b: Bill) => b.plaid_merchant)
          .filter(Boolean) as string[]
      );
      const groups = groupByMerchant(txData.transactions ?? [])
        .filter(g => !existingMerchantsRef.current.has(g.merchant));
      setTxGroups(groups);
    }).finally(() => setLoading(false));
  }, []);

  function toggleTag(merchant: string) {
    setTagged(prev => {
      const next = new Set(prev);
      if (next.has(merchant)) next.delete(merchant);
      else next.add(merchant);
      return next;
    });
  }

  useEffect(() => {
    updateAnswers({ taggedMerchants: Array.from(tagged) });
  }, [tagged, updateAnswers]);

  async function handleContinue() {
    if (tagged.size === 0 && (answers.manualBills ?? []).length === 0) {
      onContinue();
      return;
    }
    const ambiguous = Array.from(tagged).filter(merchant => {
      const group = txGroups.find(g => g.merchant === merchant);
      return group && group.count === 1;
    });
    if (ambiguous.length > 0) {
      setFrequencies(Object.fromEntries(ambiguous.map(m => [m, 'monthly'])));
      setPhase('frequency');
      return;
    }
    await saveBills();
  }

  async function saveBills() {
    setPhase('saving');
    const billsToSave = Array.from(tagged)
      .filter(merchant => frequencies[merchant] !== 'skip')
      .map(merchant => {
        const group = txGroups.find(g => g.merchant === merchant)!;
        return {
          name: merchant,
          amount: group.amount,
          due_day: group.due_day,
          recurrence: frequencies[merchant] ?? 'monthly',
          plaid_merchant: merchant,
        };
      });
    try {
      const results = await Promise.all(
        billsToSave.map(b =>
          fetch('/api/bills', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(b),
          }).then(r => r.json())
        )
      );
      setSavedBills(results.map((r: { bill?: Bill }) => r.bill).filter((b): b is Bill => Boolean(b)));
    } catch (e) {
      console.error('Bill save error:', e);
    }
    setTimeout(() => setPhase('confirmed'), 1500);
  }

  async function handleLoadMore() {
    const nextDays = days === 30 ? 60 : 90;
    setLoadingMore(true);
    try {
      const txData = await fetch(`/api/plaid/transactions?days=${nextDays}`)
        .then(r => r.json())
        .catch(() => ({ transactions: [] }));
      const groups = groupByMerchant(txData.transactions ?? [])
        .filter(g => !existingMerchantsRef.current.has(g.merchant));
      setTxGroups(groups);
      setDays(nextDays);
    } finally {
      setLoadingMore(false);
    }
  }

  const recurring = txGroups.filter(g => g.count > 1);
  const oneoff = txGroups.filter(g => g.count === 1);

  const confirmedTaggedBills = savedBills;
  const confirmedManualBills = answers.manualBills ?? [];
  const confirmedTotal = confirmedTaggedBills.reduce((sum, b) => sum + b.amount, 0)
    + confirmedManualBills.reduce((sum, b) => sum + b.amount, 0);
  const confirmedContinueDelay = (confirmedTaggedBills.length + confirmedManualBills.length) * 150 + 400;

  return (
    <>
    <div className="grid w-full h-full" style={{ gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr' }}>

      <Step2LeftPanel />

      {phase === 'tagging' && (
        <div className="flex flex-col px-8 md:px-12 py-8 gap-4">
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-[13px] font-semibold text-(--color-text-primary)">
                {loading
                  ? 'Loading transactions…'
                  : tagged.size > 0
                    ? `${tagged.size} bill${tagged.size !== 1 ? 's' : ''} tagged`
                    : `${txGroups.length} merchant${txGroups.length !== 1 ? 's' : ''}`}
              </p>
            </div>
            <div style={{ maxHeight: 'calc(100vh - 280px)', overflowY: 'auto' }}>
              {loading ? (
                <p className="text-[13px] text-(--color-text-secondary) py-4">Loading transactions…</p>
              ) : txGroups.length === 0 ? (
                <p className="text-[13px] text-(--color-text-secondary) py-4">No recent transactions found.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {[...recurring, ...oneoff].map((group, i) => {
                    const isTagged = tagged.has(group.merchant);
                    const isRecurring = group.count > 1;
                    const color = avatarColor(group.merchant);
                    const showDivider = i === recurring.length && recurring.length > 0 && oneoff.length > 0;
                    return (
                      <div key={group.merchant}>
                        {showDivider && (
                          <p className="text-[10px] text-(--color-text-tertiary) text-center my-2">— appeared once —</p>
                        )}
                        <div style={{ animation: 'fadeSlideUp 300ms ease-out both', animationDelay: `${i * 40}ms` }}>
                          <button
                            onClick={() => toggleTag(group.merchant)}
                            className={`w-full bg-(--color-elevated) border rounded-md px-4 py-3 flex items-center gap-3 text-left transition-colors ${
                              isTagged
                                ? 'border-(--color-accent) bg-(--color-accent)/5'
                                : 'border-(--color-border-default) hover:border-(--color-border-strong)'
                            }`}
                            style={{
                              ...(isRecurring && !isTagged && {
                                borderLeft: '3px solid color-mix(in srgb, var(--color-accent) 40%, transparent)',
                              }),
                            }}
                          >
                            <div className={`w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-[12px] font-bold ${color}`}>
                              {group.merchant.charAt(0).toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="text-[13px] font-medium text-(--color-text-primary) truncate">{group.merchant}</p>
                                {isRecurring && (
                                  <span className="text-[11px] font-semibold text-(--color-accent) shrink-0">
                                    {group.count}×
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] text-(--color-text-tertiary)">{formatShortDate(group.recentDate)}</p>
                            </div>
                            <p className="text-[13px] font-(--font-mono) text-(--color-text-primary) shrink-0">
                              ${formatMoney(group.amount)}
                            </p>
                            <div
                              className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                                isTagged
                                  ? 'bg-(--color-accent) text-(--color-base)'
                                  : 'border border-(--color-border-default) text-(--color-text-tertiary)'
                              }`}
                            >
                              {isTagged && <Check size={13} />}
                            </div>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            {!loading && txGroups.length > 0 && days < 90 && (
              <button
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="text-[12px] text-(--color-text-tertiary) hover:text-(--color-text-primary) transition-colors mt-2 disabled:opacity-40"
              >
                {loadingMore ? 'Loading…' : `Load ${days === 30 ? 60 : 90} days →`}
              </button>
            )}
          </div>

          {manualSaved.length > 0 && (
            <div className="flex flex-col gap-2">
              {manualSaved.map((b, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-3 rounded-md border border-(--color-accent)/30 bg-(--color-accent)/5">
                  <div className={`w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-[12px] font-bold ${avatarColor(b.name)}`}>
                    {b.name.charAt(0).toUpperCase()}
                  </div>
                  <p className="text-[13px] font-medium text-(--color-text-primary) flex-1 truncate">{b.name}</p>
                  <p className="text-[13px] font-(--font-mono) text-(--color-text-primary)">${formatMoney(b.amount)}</p>
                  <Check size={14} className="text-(--color-accent) shrink-0" />
                </div>
              ))}
            </div>
          )}

          <button
            onClick={() => setShowManualForm(true)}
            className="text-[12px] text-(--color-text-tertiary) hover:text-(--color-text-primary) transition-colors"
          >
            + Add a bill manually
          </button>

          <StepNav
            onBack={onBack}
            onContinue={handleContinue}
            continueLabel={tagged.size > 0 || manualSaved.length > 0
              ? `Save ${tagged.size + manualSaved.length} bill${tagged.size + manualSaved.length !== 1 ? 's' : ''} →`
              : 'Continue →'}
          />
        </div>
      )}

      {phase === 'frequency' && (
        <div className="flex flex-col px-8 md:px-12 py-8 gap-4">
          <p className="text-[13px] text-(--color-text-tertiary)">
            You tagged {tagged.size} bill{tagged.size !== 1 ? 's' : ''}. Quick check on a few:
          </p>
          <div className="flex flex-col gap-4" style={{ maxHeight: 'calc(100vh - 280px)', overflowY: 'auto' }}>
            {Array.from(tagged)
              .filter(merchant => {
                const group = txGroups.find(g => g.merchant === merchant);
                return group && group.count === 1;
              })
              .map((merchant, i) => {
                const group = txGroups.find(g => g.merchant === merchant)!;
                const color = avatarColor(merchant);
                return (
                  <div key={merchant} className="flex flex-col gap-3 p-4 rounded-lg border border-(--color-border-default) bg-(--color-elevated)"
                    style={{ animation: 'fadeSlideUp 300ms ease-out both', animationDelay: `${i * 60}ms` }}>
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-[12px] font-bold ${color}`}>
                        {merchant.charAt(0).toUpperCase()}
                      </div>
                      <p className="text-[13px] font-medium text-(--color-text-primary) flex-1 truncate">{merchant}</p>
                      <p className="text-[13px] font-(--font-mono) text-(--color-text-primary)">${formatMoney(group.amount)}</p>
                    </div>
                    <p className="text-[11px] text-(--color-text-tertiary)">How often does this charge appear?</p>
                    <div className="flex gap-2 flex-wrap">
                      {(['monthly', 'weekly', 'yearly', 'skip'] as const).map(freq => (
                        <button
                          key={freq}
                          onClick={() => setFrequencies(f => ({ ...f, [merchant]: freq }))}
                          className="px-3 py-1.5 rounded-full text-[11px] font-medium transition-colors"
                          style={frequencies[merchant] === freq
                            ? { background: 'var(--color-accent)', color: 'var(--color-base)' }
                            : { border: '1px solid var(--color-border-default)', color: 'var(--color-text-secondary)' }}
                        >
                          {freq === 'skip' ? 'One-time — skip' : freq.charAt(0).toUpperCase() + freq.slice(1)}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
          </div>
          <StepNav
            onBack={() => setPhase('tagging')}
            onContinue={saveBills}
            continueLabel="Confirm & save →"
          />
        </div>
      )}

      {phase === 'saving' && (
        <div className="flex flex-col items-center justify-center px-8 py-12 gap-6 flex-1">
          <svg width="48" height="48" viewBox="0 0 64 64" fill="none">
            <circle
              cx="32" cy="32" r="28"
              stroke="var(--color-accent)" strokeWidth="3" fill="none"
              strokeDasharray="200"
              style={{ animation: 'checkCircle 400ms ease-out both' }}
            />
            <path
              d="M20 32 L28 40 L44 24"
              stroke="var(--color-accent)" strokeWidth="3"
              strokeLinecap="round" strokeLinejoin="round"
              strokeDasharray="50"
              style={{ animation: 'checkTick 300ms ease-out both', animationDelay: '300ms' }}
            />
          </svg>
          <p className="text-[15px] font-semibold text-(--color-text-primary)">Saving your bills…</p>
          <div className="w-full max-w-[280px] h-1 rounded-full bg-(--color-border-default) overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{ background: 'var(--color-accent)', animation: 'grow-bar 1500ms ease-out forwards' }}
            />
          </div>
        </div>
      )}

      {phase === 'confirmed' && (
        <div className="flex flex-col px-8 md:px-12 py-8 gap-4 overflow-y-auto">
          <p className="text-[20px] font-bold" style={{ color: 'var(--color-accent)' }}>
            ✓ Saved {confirmedTaggedBills.length + confirmedManualBills.length} bills
          </p>
          <div className="flex flex-col gap-2">
            {confirmedTaggedBills.map((bill, i) => (
              <div key={bill.id}
                className="flex items-center gap-3 px-4 py-3 rounded-md border border-(--color-border-default) bg-(--color-elevated)"
                style={{ animation: 'fadeSlideUp 300ms ease-out both', animationDelay: `${i * 150}ms` }}>
                <div className={`w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-[12px] font-bold ${avatarColor(bill.name)}`}>
                  {bill.name.charAt(0).toUpperCase()}
                </div>
                <p className="text-[13px] font-medium text-(--color-text-primary) flex-1 truncate">{bill.name}</p>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-(--color-border-default) text-(--color-text-tertiary) shrink-0">
                  {bill.recurrence}
                </span>
                <p className="text-[13px] font-(--font-mono) text-(--color-text-primary)">${formatMoney(bill.amount)}</p>
              </div>
            ))}
            {confirmedManualBills.map((bill, i) => (
              <div key={`manual-${i}`}
                className="flex items-center gap-3 px-4 py-3 rounded-md border border-(--color-border-default) bg-(--color-elevated)"
                style={{ animation: 'fadeSlideUp 300ms ease-out both', animationDelay: `${(confirmedTaggedBills.length + i) * 150}ms` }}>
                <div className={`w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-[12px] font-bold ${avatarColor(bill.name)}`}>
                  {bill.name.charAt(0).toUpperCase()}
                </div>
                <p className="text-[13px] font-medium text-(--color-text-primary) flex-1 truncate">{bill.name}</p>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-(--color-border-default) text-(--color-text-tertiary) shrink-0">
                  {bill.recurrence}
                </span>
                <p className="text-[13px] font-(--font-mono) text-(--color-text-primary)">${formatMoney(bill.amount)}</p>
              </div>
            ))}
          </div>
          {confirmedTotal > 0 && (
            <p className="text-[14px] text-(--color-text-tertiary)"
              style={{ animation: 'fadeSlideUp 300ms ease-out both', animationDelay: `${confirmedContinueDelay - 100}ms` }}>
              That&apos;s ${formatMoney(confirmedTotal)} / month in tracked bills.
            </p>
          )}
          <div style={{ animation: 'fadeSlideUp 300ms ease-out both', animationDelay: `${confirmedContinueDelay}ms` }}>
            <button
              onClick={onContinue}
              className="px-5 py-2.5 rounded-md text-[13px] font-semibold"
              style={{ background: 'var(--color-accent)', color: 'var(--color-base)' }}
            >
              Continue to Step 3 →
            </button>
          </div>
        </div>
      )}
    </div>

    {showManualForm && (
      <BillWizard
        showDebtStep={false}
        zIndex={70}
        onSuccess={(bill) => {
          setManualSaved(prev => [...prev, { name: bill.name, amount: bill.amount, recurrence: bill.recurrence, due_day: bill.due_day }]);
          updateAnswers({ manualBills: [...(answers.manualBills ?? []), { name: bill.name, amount: bill.amount, recurrence: bill.recurrence, due_day: bill.due_day }] });
          setShowManualForm(false);
        }}
        onClose={() => setShowManualForm(false)}
      />
    )}
    </>
  );
}

// ─── Steps 3–5 ───────────────────────────────────────────────────────────────

const MOCK_DEBTS = [
  { name: 'Chase Sapphire', type: 'Credit Card', balance: '$8,400',  apr: '24.99% APR' },
  { name: 'Car Loan',       type: 'Auto',        balance: '$14,200', apr: '6.9% APR'   },
  { name: 'Student Loan',   type: 'Federal',     balance: '$31,000', apr: '4.5% APR'   },
];


function Step3DebtViz() {

  // Card 3 = back, Card 2 = middle, Card 1 = front
  const cards = [
    { debt: MOCK_DEBTS[2], z: 1, toTranslateY: '8px',  rotate: '-4deg', delay: '0ms'   },
    { debt: MOCK_DEBTS[1], z: 2, toTranslateY: '4px',  rotate: '-2deg', delay: '200ms' },
    { debt: MOCK_DEBTS[0], z: 3, toTranslateY: '0px',  rotate: '0deg',  delay: '400ms' },
  ];

  return (
    <div
      style={{
        position: 'relative',
        width: 340,
        height: 220,
      }}
    >
      {cards.map(({ debt, z, toTranslateY, rotate, delay }) => {
        const isFront = z === 3;
        return (
          <div
            key={debt.name}
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: z,
              animationName: 'none',
            }}
          >
            <div
              style={{
                width: 340,
                height:200,
                background: 'var(--color-elevated)',
                border: '1px solid var(--color-border-default)',
                borderRadius: 16,
                padding: 24,
                opacity: 0,
                transform: 'translateY(60px)',
                animation: `debtCardSlideUp 500ms ease-out both`,
                animationDelay: delay,
                '--card-translate-y': toTranslateY,
                '--card-rotate': rotate,
              } as React.CSSProperties}
            >
              {/* Top row */}
              <div className="flex items-center justify-between mb-4">
                <p className="text-[16px] font-semibold text-(--color-text-primary)">{debt.name}</p>
                <span className="text-[11px] px-2.5 py-1 rounded-full bg-(--color-overlay) text-(--color-text-tertiary)">
                  {debt.type}
                </span>
              </div>
              {/* Bottom row */}
              <div className="flex items-end justify-between">
                <p className="text-[26px] font-bold font-(--font-mono) text-(--color-text-primary)">{debt.balance}</p>
                <p className="text-[13px] text-(--color-danger)">{debt.apr}</p>

              </div>
              {/* Card number */}
              <p style={{ marginTop: 14, fontFamily: 'var(--font-mono)', fontSize: 12, letterSpacing: '0.18em', color: 'var(--color-text-disabled)' }}>
                xxxx&nbsp;&nbsp;xxxx&nbsp;&nbsp;xxxx&nbsp;&nbsp;xxxx
              </p>
              {/* ✓ Tracked badge — front card only */}
              {isFront && (
                <div
                  style={{
                    position: 'absolute',
                    top: 12,
                    right: 12,
                    width: 24,
                    height: 24,
                    borderRadius: '50%',
                    background: 'var(--color-accent)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: 0,
                    transform: 'scale(0.95)',
                    animation: 'scaleIn 300ms cubic-bezier(0.16,1,0.3,1) both',
                    animationDelay: '1200ms',
                  }}
                >
                  <span style={{ color: 'var(--color-base)', fontSize: 11, fontWeight: 700, lineHeight: 1 }}>✓</span>
                </div>
              )}
              {/* invisible spacer so badge doesn't overlap content */}
              {isFront && <div style={{ height: 0 }} aria-hidden />}
            </div>
          </div>
        );
      })}
      {/* Suppress unused var warning — i is not used */}
    </div>
  );
}

function Step3LeftPanel() {
  return (
    <div className="bg-(--color-elevated) flex flex-col h-full px-10 py-12 gap-8">
      {/* Text block */}
      <div className="flex flex-col justify-start gap-4 shrink-0">
        <p
          className="text-[11px] uppercase tracking-[0.12em] font-semibold text-(--color-accent)"
          style={{ animation: 'fadeSlideUp 500ms ease-out both', animationDelay: '200ms' }}
        >
          KNOW WHAT YOU OWE
        </p>
        <p
          className="text-[38px] font-bold leading-[1.2] text-(--color-text-primary) max-w-[520px]"
          style={{ animation: 'fadeSlideUp 500ms ease-out both', animationDelay: '350ms' }}
        >
          Debt doesn&apos;t disappear by ignoring it.
        </p>
        <p
          className="text-[18px] font-normal leading-relaxed text-(--color-text-secondary)"
          style={{ animation: 'fadeSlideUp 500ms ease-out both', animationDelay: '500ms' }}
        >
          Adding your debts gives you a real net worth number — not a fake one. We&apos;ll track
          payoff timelines and monthly interest so you always know where you stand.
        </p>
        <p
          className="text-[13px] text-(--color-text-tertiary)"
          style={{ animation: 'fadeSlideUp 500ms ease-out both', animationDelay: '650ms' }}
        >
          💡 Credit cards, car loans, student loans — anything with a balance and an interest rate counts.
        </p>
      </div>
      {/* Viz zone */}
      <div className="flex-1 flex items-center justify-center max-h-[400]">
        <Step3DebtViz />
      </div>
    </div>
  );
}

function Step3Panel({ onBack, onContinue, activeContext }: Step3Props) {
  const [debts, setDebts] = useState<DebtSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDebtWizard, setShowDebtWizard] = useState(false);

  const fetchDebts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/debts/summary?context_type=${activeContext.type}&context_id=${activeContext.id}`
      );
      const d = await res.json();
      setDebts(d.debts ?? []);
    } finally {
      setLoading(false);
    }
  }, [activeContext.type, activeContext.id]);

  useEffect(() => { fetchDebts(); }, [fetchDebts]);

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 h-full">
        {/* Left — editorial + Step5Viz mock */}
        <Step3LeftPanel />

        {/* Right — debt list + nav */}
        <div className="flex flex-col h-full px-8">
          <div className="flex-1 flex flex-col gap-4 overflow-y-auto py-6">
            <div className="flex items-center justify-between">
              <p className="text-[13px] font-semibold text-(--color-text-primary)">
                {loading ? 'Loading…' : `${debts.length} debt${debts.length !== 1 ? 's' : ''} added`}
              </p>
              <button
                onClick={() => setShowDebtWizard(true)}
                className="text-[13px] text-(--color-accent) hover:opacity-80 transition-opacity"
              >
                + Add a debt
              </button>
            </div>

            {loading ? (
              <p className="text-center text-[13px] text-(--color-text-tertiary)">Loading…</p>
            ) : debts.length === 0 ? (
              <p className="text-center text-[13px] text-(--color-text-tertiary)">No debts added yet.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {debts.map(d => (
                  <div
                    key={d.id}
                    className="flex items-center justify-between p-3 rounded-xl border border-(--color-border-default) bg-(--color-base)"
                    style={{ animation: 'fadeSlideUp 300ms ease-out both' }}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-[18px]">{d.icon}</span>
                      <div>
                        <p className="text-[14px] font-semibold text-(--color-text-primary)">{d.name}</p>
                        <p className="text-[11px] text-(--color-text-tertiary) capitalize">
                          {d.debt_type.replace('_', ' ')}
                        </p>
                      </div>
                    </div>
                    <p className="text-[13px] font-(--font-mono) text-(--color-text-secondary)">
                      ${d.current_balance.toLocaleString()}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <StepNav onBack={onBack} onContinue={onContinue} />
        </div>
      </div>

      {showDebtWizard && (
        <DebtWizard
          contextType={activeContext.type}
          contextId={activeContext.id}
          onDebtSaved={fetchDebts}
          onSuccess={() => setShowDebtWizard(false)}
          onClose={() => setShowDebtWizard(false)}
          zIndex={70}
        />
      )}
    </>
  );
}

const ASSET_SVGS = [
  <svg key="house" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z"/>
    <path d="M9 21V12h6v9"/>
  </svg>,
  <svg key="car" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 17H3v-5l2-5h14l2 5v5h-2"/>
    <circle cx="7.5" cy="17" r="1.5"/>
    <circle cx="16.5" cy="17" r="1.5"/>
    <path d="M5 12h14"/>
  </svg>,
  <svg key="ring" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="15" r="5"/>
    <path d="M8.5 9l1.5-4h4l1.5 4"/>
    <path d="M9.5 9h5"/>
  </svg>,
];

const DEBT_SVGS = [
  <svg key="card" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="5" width="20" height="14" rx="2"/>
    <path d="M2 10h20"/>
    <path d="M6 15h4"/>
  </svg>,
  <svg key="grad" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 10L12 5 2 10l10 5 10-5z"/>
    <path d="M6 12v5c0 1.657 2.686 3 6 3s6-1.343 6-3v-5"/>
  </svg>,
];

function NetWorthEquation() {
  const [assetTotal, setAssetTotal] = useState(0);
  const [debtTotal,  setDebtTotal]  = useState(0);

  useEffect(() => {
    let raf = 0;
    const timer = setTimeout(() => {
      const t0 = performance.now();
      const dur = 1600, target = 44200;
      const frame = (ts: number) => {
        const p = Math.min((ts - t0) / dur, 1);
        setAssetTotal(Math.round(target * (1 - Math.pow(1 - p, 3))));
        if (p < 1) raf = requestAnimationFrame(frame);
      };
      raf = requestAnimationFrame(frame);
    }, 600);
    return () => { clearTimeout(timer); cancelAnimationFrame(raf); };
  }, []);

  useEffect(() => {
    let raf = 0;
    const timer = setTimeout(() => {
      const t0 = performance.now();
      const dur = 1200, target = 31000;
      const frame = (ts: number) => {
        const p = Math.min((ts - t0) / dur, 1);
        setDebtTotal(Math.round(target * (1 - Math.pow(1 - p, 3))));
        if (p < 1) raf = requestAnimationFrame(frame);
      };
      raf = requestAnimationFrame(frame);
    }, 2200);
    return () => { clearTimeout(timer); cancelAnimationFrame(raf); };
  }, []);

  return (
    <div style={{ transform: 'scale(1.3)', transformOrigin: 'center' }}>
      <div className="flex items-end gap-4 justify-center">

        {/* Assets column */}
        <div className="flex flex-col items-center gap-2">
          <div className="flex flex-col gap-1">
            {ASSET_SVGS.map((svg, i) => (
              <div
                key={i}
                className="w-12 h-12 rounded-full bg-(--color-elevated) border border-(--color-border-default) flex items-center justify-center"
                style={{
                  color: 'var(--color-accent)',
                  opacity: 0,
                  animation: 'assetIconDrop 800ms cubic-bezier(0.34, 1.56, 0.64, 1) both',
                  animationDelay: `${400 + i * 400}ms`,
                }}
              >
                {svg}
              </div>
            ))}
          </div>
          <p className="text-[16px] font-(--font-mono) font-bold text-(--color-text-primary)">
            ${assetTotal.toLocaleString()}
          </p>
          <p className="text-[10px] uppercase tracking-widest text-(--color-text-tertiary)">Assets</p>
        </div>

        {/* Minus sign */}
        <p
          className="text-[32px] font-bold text-(--color-text-tertiary) pb-10"
          style={{ opacity: 0, animation: 'fadeIn 300ms ease-out 1800ms both' }}
        >
          −
        </p>

        {/* Debts column */}
        <div className="flex flex-col items-center gap-2">
          <div className="flex flex-col gap-1">
            {DEBT_SVGS.map((svg, i) => (
              <div
                key={i}
                className="w-12 h-12 rounded-full bg-(--color-elevated) border border-(--color-border-default) flex items-center justify-center"
                style={{
                  color: 'var(--color-danger)',
                  opacity: 0,
                  animation: 'assetIconDrop 800ms cubic-bezier(0.34, 1.56, 0.64, 1) both',
                  animationDelay: `${2000 + i * 400}ms`,
                }}
              >
                {svg}
              </div>
            ))}
          </div>
          <p className="text-[16px] font-(--font-mono) font-bold text-(--color-text-secondary)">
            ${debtTotal.toLocaleString()}
          </p>
          <p className="text-[10px] uppercase tracking-widest text-(--color-text-tertiary)">Debts</p>
        </div>

        {/* Equals sign */}
        <p
          className="text-[32px] font-bold text-(--color-text-tertiary) pb-10"
          style={{ opacity: 0, animation: 'fadeIn 300ms ease-out 3000ms both' }}
        >
          =
        </p>

        {/* Net Worth result */}
        <div className="flex flex-col items-center gap-1 pb-1">
          <p
            className="text-[34px] font-bold font-(--font-mono)"
            style={{
              color: 'var(--color-accent)',
              opacity: 0,
              animation: 'scaleIn 400ms cubic-bezier(0.34, 1.56, 0.64, 1) 3200ms both',
            }}
          >
            $13,200
          </p>
          <div
            style={{
              height: 2,
              width: '100%',
              background: 'var(--color-accent)',
              transform: 'scaleX(0)',
              transformOrigin: 'left',
              animation: 'sweepUnderline 300ms ease-out 3800ms both',
            }}
          />
          <p className="text-[10px] uppercase tracking-widest text-(--color-text-tertiary) mt-1">Net Worth</p>
        </div>

      </div>
    </div>
  );
}

function Step4AssetViz() {
  return <NetWorthEquation />;
}

function Step4LeftPanel() {
  return (
    <div className="bg-(--color-elevated) flex flex-col h-full px-10 py-12 gap-8">
      <div className="flex flex-col justify-start gap-4 shrink-0">
        <p
          className="text-[11px] uppercase tracking-[0.12em] font-semibold text-(--color-accent)"
          style={{ animation: 'fadeSlideUp 500ms ease-out both', animationDelay: '200ms' }}
        >
          THE OTHER SIDE
        </p>
        <p
          className="text-[38px] font-bold leading-[1.2] text-(--color-text-primary) max-w-[520px]"
          style={{ animation: 'fadeSlideUp 500ms ease-out both', animationDelay: '350ms' }}
        >
          What do you own?
        </p>
        <p
          className="text-[18px] font-normal leading-relaxed text-(--color-text-secondary)"
          style={{ animation: 'fadeSlideUp 500ms ease-out both', animationDelay: '500ms' }}
        >
          Net worth is assets minus debts. Your cash, investments, property, and vehicles all count.
        </p>
        <p
          className="text-[13px] text-(--color-text-tertiary)"
          style={{ animation: 'fadeSlideUp 500ms ease-out both', animationDelay: '650ms' }}
        >
          💡 Don&apos;t underestimate this. Even a paid-off car and a savings account add up.
        </p>
      </div>
      <div className="flex-1 flex items-center justify-center max-h-[400]">
        <Step4AssetViz />
      </div>
    </div>
  );
}

interface PlaidAccount {
  account_name: string;
  institution_name: string;
  account_subtype: string | null;
  current_balance: number;
}

const DEPOSITORY_SUBTYPES = ['checking', 'savings', 'money market', 'cd', 'hsa', 'cash management', 'prepaid'];
const ELIGIBLE_DEBT_TYPES  = ['auto', 'mortgage'];

function debtTypeToName(type: string): string {
  if (type === 'auto')     return 'Vehicle';
  if (type === 'mortgage') return 'Home';
  return type;
}

function Step4Panel({ onBack, onContinue, activeContext }: Step4Props) {
  const [assets, setAssets]               = useState<AssetSummary[]>([]);
  const [claimedDebtIds, setClaimedDebtIds] = useState<string[]>([]);
  const [plaidAccounts, setPlaidAccounts] = useState<PlaidAccount[]>([]);
  const [eligibleDebts, setEligibleDebts] = useState<DebtSummary[]>([]);
  const [loading, setLoading]             = useState(true);
  const [showAssetWizard, setShowAssetWizard] = useState(false);
  const [wizardPrefill, setWizardPrefill] = useState<{ name: string; linkedDebtId: string } | null>(null);

  const fetchAssets = useCallback(async () => {
    const params = `context_type=${activeContext.type}&context_id=${activeContext.id}`;
    const res = await fetch(`/api/assets/summary?${params}`);
    const data = await res.json();
    setAssets(data.assets ?? []);
    setClaimedDebtIds(data.claimed_debt_ids ?? []);
  }, [activeContext.type, activeContext.id]);

  useEffect(() => {
    async function init() {
      setLoading(true);
      try {
        const [plaidRes, debtsRes] = await Promise.all([
          fetch('/api/plaid/accounts'),
          fetch(`/api/debts/summary?context_type=${activeContext.type}&context_id=${activeContext.id}`),
        ]);
        const plaidData  = await plaidRes.json();
        const debtsData  = await debtsRes.json();
        setPlaidAccounts(
          (plaidData.accounts ?? []).filter((a: PlaidAccount) =>
            a.account_subtype && DEPOSITORY_SUBTYPES.includes(a.account_subtype)
          )
        );
        setEligibleDebts(
          (debtsData.debts ?? []).filter((d: DebtSummary) => ELIGIBLE_DEBT_TYPES.includes(d.debt_type))
        );
        await fetchAssets();
      } finally {
        setLoading(false);
      }
    }
    init();
  }, [activeContext.type, activeContext.id, fetchAssets]);

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 h-full">
        {/* Left — editorial + viz */}
        <Step4LeftPanel />

        {/* Right — asset phases + nav */}
        <div className="flex flex-col h-full px-8">
          <div className="flex-1 flex flex-col gap-6 overflow-y-auto py-6">

            {/* ── Phase 1: Plaid auto-import ──────────────────────────── */}
            {plaidAccounts.length > 0 && (
              <div className="flex flex-col gap-3">
                <p className="text-[12px] text-(--color-text-tertiary) uppercase tracking-[0.1em]">
                  Auto-imported from your bank
                </p>
                {plaidAccounts.map(acct => (
                  <div
                    key={acct.account_name}
                    className="flex items-center justify-between p-3 rounded-xl border border-(--color-border-default) bg-(--color-base)"
                    style={{ animation: 'fadeSlideUp 300ms ease-out both' }}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-[18px]">🏦</span>
                      <div>
                        <p className="text-[14px] font-semibold text-(--color-text-primary)">{acct.account_name}</p>
                        <p className="text-[11px] text-(--color-text-tertiary)">{acct.institution_name}</p>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <p className="text-[13px] font-(--font-mono) text-(--color-text-primary)">
                        ${acct.current_balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                      <span className="text-[10px] text-(--color-accent)">✓ Auto-imported</span>
                    </div>
                  </div>
                ))}
                <p className="text-[11px] text-(--color-text-disabled)">
                  These balances update automatically when your bank syncs.
                </p>
              </div>
            )}

            {/* ── Phase 2: Debt-to-asset prompt ──────────────────────── */}
            {eligibleDebts.length > 0 && (
              <div className="flex flex-col gap-3">
                <p className="text-[13px] font-semibold text-(--color-text-primary)">
                  Do any of your debts have an asset behind them?
                </p>
                {eligibleDebts.map(debt => {
                  const isClaimed = claimedDebtIds.includes(debt.id);
                  return (
                    <div
                      key={debt.id}
                      className="flex items-center justify-between p-3 rounded-xl border border-(--color-border-default) bg-(--color-base)"
                      style={{ animation: 'fadeSlideUp 300ms ease-out both' }}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-[18px]">{debt.icon}</span>
                        <div>
                          <p className="text-[14px] font-semibold text-(--color-text-primary)">{debt.name}</p>
                          <span className="text-[11px] px-2 py-0.5 rounded-full bg-(--color-overlay) text-(--color-text-tertiary) capitalize">
                            {debt.debt_type}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <p className="text-[13px] font-(--font-mono) text-(--color-text-secondary)">
                          ${debt.current_balance.toLocaleString()}
                        </p>
                        {isClaimed ? (
                          <span className="text-[11px] text-(--color-accent)">✓ Linked</span>
                        ) : (
                          <button
                            onClick={() => {
                              setWizardPrefill({ name: debtTypeToName(debt.debt_type), linkedDebtId: debt.id });
                              setShowAssetWizard(true);
                            }}
                            className="w-5 h-5 rounded border border-(--color-border-strong) flex items-center justify-center hover:border-(--color-accent) transition-colors"
                            aria-label={`Link asset to ${debt.name}`}
                          >
                            <span className="text-[10px] text-(--color-text-tertiary)">+</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* ── Phase 3: Manual asset entry ────────────────────────── */}
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <p className="text-[13px] font-semibold text-(--color-text-primary)">
                  {loading ? 'Loading…' : `${assets.length} asset${assets.length !== 1 ? 's' : ''} added`}
                </p>
                <button
                  onClick={() => { setWizardPrefill(null); setShowAssetWizard(true); }}
                  className="text-[13px] text-(--color-accent) hover:opacity-80 transition-opacity"
                >
                  + Add an asset
                </button>
              </div>

              {!loading && assets.length === 0 && plaidAccounts.length === 0 && (
                <p className="text-center text-[13px] text-(--color-text-tertiary)">No assets added yet.</p>
              )}

              {assets.map(asset => (
                <div
                  key={asset.id}
                  className="flex items-center justify-between p-3 rounded-xl border border-(--color-border-default) bg-(--color-base)"
                  style={{ animation: 'fadeSlideUp 300ms ease-out both' }}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-[18px]">{asset.icon}</span>
                    <div>
                      <p className="text-[14px] font-semibold text-(--color-text-primary)">{asset.name}</p>
                      <p className="text-[11px] text-(--color-text-tertiary) capitalize">
                        {asset.asset_type.replace('_', ' ')}
                      </p>
                    </div>
                  </div>
                  <p className="text-[13px] font-(--font-mono) text-(--color-text-secondary)">
                    ${asset.current_value.toLocaleString()}
                  </p>
                </div>
              ))}
            </div>

          </div>

          <StepNav onBack={onBack} onContinue={onContinue} />
        </div>
      </div>

      {showAssetWizard && (
        <AssetWizard
          contextType={activeContext.type}
          contextId={activeContext.id}
          prefillName={wizardPrefill?.name}
          prefillLinkedDebtId={wizardPrefill?.linkedDebtId}
          onAssetSaved={fetchAssets}
          onSuccess={() => setShowAssetWizard(false)}
          onClose={() => setShowAssetWizard(false)}
          zIndex={70}
        />
      )}
    </>
  );
}

function Step5GoalViz() {
  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative w-52 h-52">
        <svg viewBox="0 0 128 128" className="w-full h-full" fill="none">
          {/* track */}
          <circle
            cx="64" cy="64" r="54"
            stroke="var(--color-border-default)"
            strokeWidth="8"
            strokeDasharray="339.3"
            strokeDashoffset="0"
            transform="rotate(-90 64 64)"
          />
          {/* fill ring */}
          <circle
            cx="64" cy="64" r="54"
            stroke="var(--color-accent)"
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray="339.3"
            transform="rotate(-90 64 64)"
            style={{
              strokeDashoffset: 339.3,
              animationName: 'goalRingFill',
              animationDuration: '1200ms',
              animationTimingFunction: 'ease-out',
              animationDelay: '300ms',
              animationFillMode: 'forwards',
            }}
          />
        </svg>
        {/* house icon centered over ring */}
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{ color: 'var(--color-accent)' }}
        >
          <svg width="42" height="42" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z"/>
            <path d="M9 21V12h6v9"/>
          </svg>
        </div>
      </div>
      {/* label fades in after ring finishes */}
      <div
        className="text-center"
        style={{
          opacity: 0,
          animationName: 'fadeIn',
          animationDuration: '400ms',
          animationDelay: '1400ms',
          animationFillMode: 'forwards',
        }}
      >
        <p className="text-[14px] font-semibold text-(--color-text-primary)">Down Payment</p>
        <p className="text-[12px] font-(--font-mono) text-(--color-text-secondary)">
          $11,200 / $32,000
        </p>
      </div>
    </div>
  );
}

function Step5LeftPanel() {
  return (
    <div className="hidden md:flex flex-col gap-30 h-full px-8 py-8 bg-(--color-elevated)">
      <div className="flex flex-col gap-4">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-(--color-accent)">
          YOUR FIRST GOAL
        </p>
        <h2
          className="text-[28px] font-bold leading-tight text-(--color-text-primary) w-full"
        >
          What are you saving for?
        </h2>
        <p className="text-[14px] text-(--color-text-secondary) leading-relaxed max-w-[500px]">
          A savings goal keeps your money working toward something real —
          whether that&apos;s a down payment, an emergency fund, or a dream trip.
        </p>
        <div className="mt-2 bg-(--color-elevated) border border-(--color-border-default) rounded-xl px-4 py-3 text-[12px] text-(--color-text-secondary) leading-relaxed max-w-[480px]">
          <span className="text-(--color-text-primary) font-semibold">💡 Tip: </span>
          You can add as many goals as you need. Each one gets its own progress tracking and budgets.
        </div>
      </div>
      <div className="flex justify-center pb-4">
        <Step5GoalViz />
      </div>
    </div>
  );
}

function Step5Panel({ onBack, onContinue, activeContext }: Step5Props) {
  const [goals, setGoals] = useState<GoalSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [showGoalWizard, setShowGoalWizard] = useState(false);

  const fetchGoals = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/goals/summary?context_type=${activeContext.type}&context_id=${activeContext.id}`
      );
      const d = await res.json();
      setGoals(d.goals ?? []);
    } finally {
      setLoading(false);
    }
  }, [activeContext.type, activeContext.id]);

  useEffect(() => { fetchGoals(); }, [fetchGoals]);

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 h-full">
        <Step5LeftPanel />

        <div className="flex flex-col h-full">
          <div className="flex-1 flex flex-col gap-4 overflow-y-auto px-8 py-6">
            <div className="flex items-center justify-between">
              <p className="text-[13px] font-semibold text-(--color-text-primary)">
                {loading ? 'Loading…' : `${goals.length} goal${goals.length !== 1 ? 's' : ''} added`}
              </p>
              <button
                onClick={() => setShowGoalWizard(true)}
                className="text-[13px] text-(--color-accent) hover:opacity-80 transition-opacity"
              >
                + Add a goal
              </button>
            </div>

            {loading ? (
              <p className="text-center text-[13px] text-(--color-text-tertiary)">Loading…</p>
            ) : goals.length === 0 ? (
              <p className="text-center text-[13px] text-(--color-text-tertiary)">No goals added yet.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {goals.map(g => (
                  <div
                    key={g.id}
                    className="flex items-center justify-between p-3 rounded-xl border border-(--color-border-default) bg-(--color-base)"
                    style={{ animation: 'fadeSlideUp 300ms ease-out both' }}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-[18px]">{g.icon}</span>
                      <div>
                        <p className="text-[14px] font-semibold text-(--color-text-primary)">{g.name}</p>
                        {g.target_amount != null && (
                          <p className="text-[11px] text-(--color-text-tertiary)">
                            ${g.current_balance.toLocaleString()} / ${g.target_amount.toLocaleString()}
                          </p>
                        )}
                      </div>
                    </div>
                    <p className="text-[12px] text-(--color-text-tertiary)">{g.percent_complete}%</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="px-8">
            <StepNav onBack={onBack} onContinue={onContinue} continueLabel="Finish setup →" />
          </div>
        </div>
      </div>

      {showGoalWizard && (
        <FullScreenGoalWizard
          activeContext={activeContext}
          skipBudgetStep={false}
          zIndex={70}
          onCreated={() => { setShowGoalWizard(false); fetchGoals(); }}
          onClose={() => setShowGoalWizard(false)}
        />
      )}
    </>
  );
}

// ─── Snapshot helpers ─────────────────────────────────────────────────────────

function snapshotClamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

function computeSnapshotScore(
  transactions: Transaction[],
  budgets: { status: string; percent_used: number }[],
  netWorth: { total_debts: number } | null,
  accounts: PlaidAccount[],
) {
  const totalSpent  = transactions.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const totalIncome = transactions.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);

  const savingsScore = totalIncome > 0
    ? snapshotClamp(25 * (1 - totalSpent / totalIncome), 0, 25) : 12;

  const dtiScore = totalIncome > 0
    ? snapshotClamp(25 * (1 - (netWorth?.total_debts ?? 0) / (totalIncome * 12) / 0.5), 0, 25) : 25;

  const savingsBalance = accounts
    .filter(a => a.account_subtype === "savings")
    .reduce((s, a) => s + a.current_balance, 0);
  const emergencyScore = snapshotClamp(25 * (savingsBalance / (totalSpent > 0 ? totalSpent : 1) / 6), 0, 25);

  const activeBudgets = budgets.filter(b => b.status === "active");
  const adherenceScore = activeBudgets.length > 0
    ? 25 * (activeBudgets.filter(b => b.percent_used <= 100).length / activeBudgets.length) : 25;

  return {
    activeBudgetCount: activeBudgets.length,
    components: [
      { label: "Savings rate",     score: Math.round(savingsScore) },
      { label: "Debt-to-income",   score: Math.round(dtiScore) },
      { label: "Emergency fund",   score: Math.round(emergencyScore) },
      { label: "Budget adherence", score: Math.round(adherenceScore) },
    ],
  };
}

function snapshotScoreColor(score: number) {
  if (score >= 20) return "var(--color-accent)";
  if (score >= 10) return "#f59e0b";
  return "var(--color-danger)";
}

function snapshotInterpret(label: string, score: number, activeBudgetCount: number): string {
  switch (label) {
    case "Savings rate":
      return score >= 20 ? "Strong savings habit" : score >= 10 ? "Room to save more" : "Spending close to income";
    case "Debt-to-income":
      return score >= 20 ? "Low debt load" : score >= 10 ? "Manageable debt" : "High debt relative to income";
    case "Emergency fund":
      return score >= 20 ? "Well cushioned" : score >= 10 ? "Building a buffer" : "Under 3 months coverage";
    case "Budget adherence":
      return activeBudgetCount === 0 ? "Add budgets to track this" : score >= 20 ? "Budgets on track" : "Some budgets over limit";
    default: return "";
  }
}

function CountingNetWorth({ value, isPositive }: { value: number; isPositive: boolean }) {
  const [displayed, setDisplayed] = useState(0);

  useEffect(() => {
    const target = Math.abs(value);
    const DURATION = 2000;
    let rafId = 0;
    let startTime: number | null = null;

    function tick(now: number) {
      if (startTime === null) startTime = now;
      const t = Math.min((now - startTime) / DURATION, 1);
      setDisplayed(target * (1 - Math.pow(1 - t, 3)));
      if (t < 1) rafId = requestAnimationFrame(tick);
    }

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [value]);

  return (
    <p
      className="text-[64px] font-bold leading-none"
      style={{ color: isPositive ? "var(--color-accent)" : "var(--color-danger)", fontFamily: "var(--font-mono)" }}
      data-testid="celebration-net-worth"
    >
      {isPositive ? "" : "-"}${formatMoney(displayed)}
    </p>
  );
}

// ─── OnboardingModal ──────────────────────────────────────────────────────────

export default function OnboardingModal({ activeContext, onNavigate, onComplete }: Props) {
  const [state, setState] = useState<OnboardingState | null>(null);
  const [showModal, setShowModal] = useState(true);
  const [checklistExpanded, setChecklistExpanded] = useState(false);
  const [celebrating, setCelebrating] = useState(false);
  const [celebrationData, setCelebrationData] = useState<{
    net_worth: number;
    total_assets: number;
    total_debts: number;
    transactions: Transaction[];
    accounts: PlaidAccount[];
    budgets: { status: string; percent_used: number }[];
  } | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [step1Success, setStep1Success] = useState(false);
  const [syncedTransactions, setSyncedTransactions] = useState<Transaction[]>([]);
  const [transactionCount, setTransactionCount] = useState<number>(0);
  const [revealPhase, setRevealPhase] = useState<'syncing' | 'complete' | 'revealed'>('syncing');
  const [connectedBankName, setConnectedBankName] = useState<string | null>(null);

  const [onboardingAnswers, setOnboardingAnswers] = useState<OnboardingAnswers>({
    confirmedBills: [],
    taggedMerchants: [],
    manualBills: [],
    goalName: '',
    goalTarget: null,
    goalTargetDate: null,
    goalIcon: '🏠',
    debts: [],
    assets: [],
  });

  const updateAnswers = useCallback((updates: Partial<OnboardingAnswers>) => {
    setOnboardingAnswers(prev => ({ ...prev, ...updates }));
  }, []);

  const load = useCallback(async () => {
    const res = await fetch("/api/onboarding");
    if (!res.ok) return;
    const { onboarding } = await res.json();
    if (!onboarding) return;
    setState(onboarding);
  }, []);

  // Auto-sync: check if steps are now complete based on context
  const syncSteps = useCallback(async () => {
    const ctxParams = `context_type=${activeContext.type}&context_id=${activeContext.id}`;

    const [goalsRes, debtsRes, assetsRes, budgetsRes, plaidRes] = await Promise.all([
      fetch(`/api/goals/summary?${ctxParams}`).then(r => r.json()).catch(() => ({ goals: [] })),
      fetch(`/api/debts/summary?${ctxParams}`).then(r => r.json()).catch(() => ({ debts: [] })),
      fetch(`/api/assets/summary?${ctxParams}`).then(r => r.json()).catch(() => ({ assets: [] })),
      fetch(`/api/budget/summary?${ctxParams}`).then(r => r.json()).catch(() => ({ summaries: [] })),
      fetch("/api/plaid/transactions").then(r => r.json()).catch(() => ({ accounts: [] })),
    ]);

    const institutionName = (plaidRes.accounts ?? [])[0]?.institution_name ?? null;
    if (institutionName) setConnectedBankName(institutionName);

    const patch: Partial<OnboardingState> = {
      connected_bank:     (plaidRes.accounts ?? []).length > 0,
      added_savings_goal: (goalsRes.goals ?? []).length > 0,
      added_debt:         (debtsRes.debts ?? []).length > 0,
      added_asset:        (assetsRes.assets ?? []).length > 0,
      set_up_budget:      (budgetsRes.summaries ?? []).length > 0,
    };

    await fetch("/api/onboarding", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
    await load();
  }, [activeContext.type, activeContext.id, load]);

  const fetchSyncedTransactions = useCallback(async () => {
    try {
      await fetch('/api/plaid/sync', { method: 'POST' });
      const res = await fetch('/api/plaid/transactions');
      if (!res.ok) return;
      const data = await res.json();
      const txList: Transaction[] = (data.transactions ?? []).slice(0, 4);
      setSyncedTransactions(txList);
      setTransactionCount(data.transactions?.length ?? 0);
    } catch {
      // silent fail — Continue button still appears without cards
    }
  }, []);

  const onStep1Success = useCallback(() => {
    setStep1Success(true);
    setRevealPhase('syncing');
    const fetchPromise = fetchSyncedTransactions();
    syncSteps();
    setTimeout(() => setRevealPhase('complete'), 1500);
    setTimeout(async () => {
      await fetchPromise;
      setRevealPhase('revealed');
    }, 2000);
  }, [fetchSyncedTransactions, syncSteps]);

  useEffect(() => { load(); }, [load]);
  // Sync on mount once to catch already-completed steps
  useEffect(() => { syncSteps(); }, [syncSteps]);

  // When bank was connected in a previous session, seed connectedBankName with a
  // placeholder immediately so the CTA doesn't flash while syncSteps resolves
  useEffect(() => {
    if (!state?.connected_bank || step1Success || connectedBankName) return;
    setConnectedBankName('Your bank');
  }, [state?.connected_bank, step1Success, connectedBankName]);

  const completeAll = useCallback(async () => {
    const ctxParams = `context_type=${activeContext.type}&context_id=${activeContext.id}`;
    const [nwRes, txRes, accountsRes, budgetsRes] = await Promise.all([
      fetch(`/api/net-worth?${ctxParams}`).then(r => r.ok ? r.json() : null),
      fetch("/api/plaid/transactions").then(r => r.ok ? r.json() : null),
      fetch("/api/plaid/accounts").then(r => r.ok ? r.json() : null),
      fetch(`/api/budget/summary?${ctxParams}`).then(r => r.ok ? r.json() : null),
    ]);
    setCelebrationData({
      net_worth:    nwRes?.net_worth    ?? 0,
      total_assets: nwRes?.total_assets ?? 0,
      total_debts:  nwRes?.total_debts  ?? 0,
      transactions: txRes?.transactions ?? [],
      accounts:     accountsRes?.accounts ?? [],
      budgets:      budgetsRes?.summaries ?? [],
    });
    setCelebrating(true);
  }, [activeContext.type, activeContext.id]);

  const finishOnboarding = useCallback(async () => {
    try {
      // confirmedBills are already in the DB from sync — no re-post needed
      if (onboardingAnswers.goalName && onboardingAnswers.goalTarget) {
        await fetch('/api/goals', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: onboardingAnswers.goalName,
            target_amount: onboardingAnswers.goalTarget,
            target_date: onboardingAnswers.goalTargetDate,
            icon: onboardingAnswers.goalIcon,
            goal_type: 'savings',
          }),
        });
      }
      await Promise.all(
        onboardingAnswers.debts.map(d => fetch('/api/debts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(d),
        }))
      );
      await Promise.all(
        onboardingAnswers.assets.map(a => fetch('/api/assets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(a),
        }))
      );
    } catch (e) {
      console.error('Onboarding finish error:', e);
    } finally {
      await syncSteps();
      await completeAll();
    }
  }, [onboardingAnswers, completeAll, syncSteps]);

  // Trigger celebration when all steps become complete
  useEffect(() => {
    if (!state || celebrating) return;
    const allDone = STEPS.every(s => state[s.key]);
    if (allDone && showModal) {
      completeAll();
    }
  }, [state, showModal, celebrating, completeAll]);


  async function finishCelebration() {
    await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ onboarding_complete: true }),
    });
    setCelebrating(false);
    onComplete();
  }

  if (!state) return null;

  const completedCount = STEPS.filter(s => state[s.key]).length;
  const allDone = completedCount === STEPS.length;

  // ─── Mini checklist (shown while modal is closed) ─────────────────────────

  const miniChecklist = (
    <div className="bg-[#1e1e24] border border-[#2e2e38] rounded-xl overflow-hidden" data-testid="onboarding-checklist">
      <button
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/4 transition-colors"
        onClick={() => setChecklistExpanded(e => !e)}
        data-testid="checklist-toggle"
      >
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-[#7a7870] uppercase tracking-widest">Getting started</span>
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${allDone ? "bg-emerald-500/20 text-emerald-400" : "bg-emerald-500/20 text-emerald-400"}`}>
            {completedCount} of {STEPS.length}
          </span>
        </div>
        {checklistExpanded ? <ChevronUp size={14} className="text-[#55534e]" /> : <ChevronDown size={14} className="text-[#55534e]" />}
      </button>

      {checklistExpanded && (
        <div className="px-4 pb-4 space-y-2 border-t border-[#2e2e38] pt-3">
          {STEPS.map(step => {
            const done = state[step.key];
            return (
              <button
                key={step.key}
                onClick={() => { onNavigate(step.view); }}
                className="w-full flex items-center gap-3 text-left hover:bg-white/4 rounded-lg px-2 py-2 transition-colors"
              >
                <div className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 ${done ? "bg-emerald-500 border-emerald-500" : "border-[#2e2e38]"}`}>
                  {done && <Check size={11} className="text-black" />}
                </div>
                <span className={`text-xs ${done ? "line-through text-[#55534e]" : "text-white"}`}>{step.label}</span>
              </button>
            );
          })}
          <button
            onClick={() => setShowModal(true)}
            className="w-full text-center text-[11px] text-[#55534e] hover:text-white transition-colors pt-1"
          >
            Open setup guide →
          </button>
        </div>
      )}
    </div>
  );

  // ─── Celebration screen ────────────────────────────────────────────────────

  if (celebrating && celebrationData) {
    const isPositive = celebrationData.net_worth >= 0;
    const snap = computeSnapshotScore(
      celebrationData.transactions,
      celebrationData.budgets,
      celebrationData,
      celebrationData.accounts,
    );
    const fade = (delay: number): React.CSSProperties => ({
      animation: "fadeSlideUp 400ms ease-out both",
      animationDelay: `${delay}ms`,
    });

    return (
      <>
        {miniChecklist}
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-(--color-base)" data-testid="onboarding-celebration">
          <div className="max-w-lg mx-auto w-full px-6 flex flex-col gap-10">

            {/* Section 1 — Net Worth hero */}
            <div className="flex flex-col items-center gap-2">
              <p style={fade(200)} className="text-[11px] uppercase tracking-widest text-(--color-text-tertiary)">
                YOUR NET WORTH
              </p>
              <div style={fade(400)}>
                <CountingNetWorth value={celebrationData.net_worth} isPositive={isPositive} />
              </div>
              <p style={fade(800)} className="text-[14px] text-(--color-text-tertiary)">
                ${formatMoney(celebrationData.total_assets)} assets · ${formatMoney(celebrationData.total_debts)} debts
              </p>
            </div>

            {/* Section 2 — Health score cards */}
            <div className="grid grid-cols-2 gap-3">
              {snap.components.map((comp, i) => (
                <div
                  key={comp.label}
                  style={fade(900 + i * 150)}
                  className="bg-(--color-elevated) border border-(--color-border-default) rounded-xl p-4"
                >
                  <p className="text-[10px] uppercase tracking-widest text-(--color-text-tertiary) mb-2">
                    {comp.label}
                  </p>
                  <div className="flex items-baseline gap-1 mb-1">
                    <span
                      className="text-[28px] font-bold font-(--font-mono)"
                      style={{ color: snapshotScoreColor(comp.score) }}
                    >
                      {comp.score}
                    </span>
                    <span className="text-[14px] text-(--color-text-tertiary)">/ 25</span>
                  </div>
                  <p className="text-[12px] text-(--color-text-secondary)">
                    {snapshotInterpret(comp.label, comp.score, snap.activeBudgetCount)}
                  </p>
                </div>
              ))}
            </div>

            {/* Section 3 — CTA */}
            <div className="flex flex-col items-center gap-4">
              <p style={fade(1500)} className="text-[13px] text-(--color-text-tertiary) text-center">
                This updates automatically as your balances change.
              </p>
              <button
                style={{ ...fade(1700), background: "var(--color-accent)", color: "var(--color-base)" }}
                onClick={finishCelebration}
                className="px-8 py-3 rounded-xl text-[15px] font-semibold"
                data-testid="celebration-close-btn"
              >
                {"Let's go →"}
              </button>
            </div>

          </div>
        </div>
      </>
    );
  }

  // ─── Main onboarding modal (full-screen, blocking — no skip, no X) ────────

  return (
    <>
      {!showModal && miniChecklist}
      {showModal && (
        <div className="fixed inset-0 bg-(--color-base) z-50 flex flex-col" data-testid="onboarding-modal">

          {/* Top progress bar */}
          <div className="shrink-0 px-6 pt-6 pb-4">
            <p className="text-[11px] uppercase tracking-widest text-(--color-text-tertiary) mb-3">
              Step {currentStep + 1} of 5
            </p>
            <div className="flex gap-1">
              {STEPS.map((_, i) => (
                <div
                  key={i}
                  className="h-1 flex-1 rounded-full transition-all duration-500"
                  style={{
                    background: i <= currentStep ? "var(--color-accent)" : "var(--color-border-default)",
                    opacity: i === currentStep ? 0.6 : 1,
                  }}
                />
              ))}
            </div>
          </div>

          {/* Step content */}
          <div className="flex-1 min-h-0">
            {currentStep === 0 && (
              <Step1Panel
                onSuccess={onStep1Success}
                step1Success={step1Success}
                revealPhase={revealPhase}
                syncedTransactions={syncedTransactions}
                transactionCount={transactionCount}
                onContinue={() => setCurrentStep(1)}
                isAlreadyConnected={!step1Success && !!state?.connected_bank}
                connectedBankName={connectedBankName}
              />
            )}
            {currentStep === 1 && (
              <Step2Panel
                answers={onboardingAnswers}
                updateAnswers={updateAnswers}
                onBack={() => setCurrentStep(0)}
                onContinue={() => setCurrentStep(2)}
              />
            )}
            {currentStep === 2 && (
              <Step3Panel
                answers={onboardingAnswers}
                updateAnswers={updateAnswers}
                onBack={() => setCurrentStep(1)}
                onContinue={() => setCurrentStep(3)}
                activeContext={activeContext}
              />
            )}
            {currentStep === 3 && (
              <Step4Panel
                answers={onboardingAnswers}
                updateAnswers={updateAnswers}
                onBack={() => setCurrentStep(2)}
                onContinue={() => setCurrentStep(4)}
                activeContext={activeContext}
              />
            )}
            {currentStep === 4 && (
              <Step5Panel
                answers={onboardingAnswers}
                updateAnswers={updateAnswers}
                onBack={() => setCurrentStep(3)}
                onContinue={finishOnboarding}
                activeContext={activeContext}
              />
            )}
          </div>

          {/* Dev toolbar — visible when NEXT_PUBLIC_DEV_TOOLS=true in .env.local */}
          {process.env.NEXT_PUBLIC_DEV_TOOLS === 'true' && (
            <div className="fixed bottom-0 left-0 right-0 px-4 py-2 flex items-center gap-3 z-60">
              <span className="text-[10px] font-bold uppercase tracking-widest text-yellow-400 bg-yellow-500/15 border border-yellow-500/30 rounded px-2 py-0.5 shrink-0">
                ⚙ DEV MODE
              </span>
              <span className="text-[10px] text-yellow-300/50">
                Step {currentStep + 1} of {STEPS.length}
              </span>
              <button
                onClick={() => setCurrentStep(s => s - 1)}
                disabled={currentStep === 0}
                className="text-[11px] text-yellow-300/70 hover:text-yellow-200 border border-yellow-500/20 hover:border-yellow-500/50 rounded px-2 py-0.5 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                ← Prev
              </button>
              <button
                onClick={() => setCurrentStep(s => s + 1)}
                disabled={currentStep === STEPS.length - 1}
                className="text-[11px] text-yellow-300/70 hover:text-yellow-200 border border-yellow-500/20 hover:border-yellow-500/50 rounded px-2 py-0.5 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                Next →
              </button>
              {currentStep === 0 && !step1Success && (
                <button
                  onClick={() => {
                    setStep1Success(true);
                    setRevealPhase('syncing');
                    const fetchPromise = fetchSyncedTransactions();
                    setTimeout(() => setRevealPhase('complete'), 1500);
                    setTimeout(async () => {
                      await fetchPromise;
                      setRevealPhase('revealed');
                    }, 2000);
                  }}
                  className="text-[11px] text-yellow-300/70 hover:text-yellow-200 border border-yellow-500/20 hover:border-yellow-500/50 rounded px-2 py-0.5 transition-colors"
                >
                  ▶ Test reveal
                </button>
              )}
            </div>
          )}

        </div>
      )}
    </>
  );
}
