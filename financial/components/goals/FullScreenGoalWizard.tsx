"use client";

import { useEffect, useRef, useState } from "react";
import { Building2, ChevronRight, RefreshCw } from "lucide-react";
import { PlaidAccountInfo, ActiveContext } from "@/lib/goals/types";
import { PlaidConnectButton } from "@/components/budget/PlaidConnectButton";
import { formatMoney, CATEGORY_META } from "../budget/types";
import { EMOJI_CATEGORIES } from "@/lib/constants/emojis";

const COLORS = ['#00D4AA','#60a5fa','#a78bfa','#fb923c','#f472b6','#facc15','#34d399','#f87171'];

const STEP6_CATEGORIES = Object.entries(CATEGORY_META)
  .filter(([key]) => !["TRANSFER_IN", "TRANSFER_OUT", "OTHER"].includes(key))
  .map(([key, m]) => ({ id: key, name: m.label, color: m.hex }));

function computePeriodBounds(periodType: "daily" | "weekly" | "monthly" | "quarterly"): { period_start: string; period_end: string } {
  const now = new Date();
  const toISO = (d: Date) => d.toISOString().split("T")[0];
  switch (periodType) {
    case "daily":
      return { period_start: toISO(now), period_end: toISO(now) };
    case "weekly": {
      const dow = (now.getDay() + 6) % 7;
      const monday = new Date(now); monday.setDate(now.getDate() - dow);
      const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
      return { period_start: toISO(monday), period_end: toISO(sunday) };
    }
    case "quarterly": {
      const q = Math.floor(now.getMonth() / 3);
      const start = new Date(now.getFullYear(), q * 3, 1);
      const end = new Date(now.getFullYear(), q * 3 + 3, 0);
      return { period_start: toISO(start), period_end: toISO(end) };
    }
    case "monthly":
    default: {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      return { period_start: toISO(start), period_end: toISO(end) };
    }
  }
}

// ─── Viz Components ────────────────────────────────────────────────────────────

export function GoalViz1({ icon, name, color }: { icon: string; name: string; color: string }) {
  const [debouncedName, setDebouncedName] = useState(name);
  useEffect(() => {
    const id = setTimeout(() => setDebouncedName(name), 400);
    return () => clearTimeout(id);
  }, [name]);

  return (
    <div className="flex flex-col items-center justify-center gap-8 w-full h-full">
      <div className="relative w-40 h-40 flex items-center justify-center">
        <div
          className="absolute inset-0 rounded-full"
          style={{ border: `1px solid ${color}44`, animation: 'halo-pulse 2.5s ease-in-out infinite' }}
        />
        <div
          className="absolute rounded-full"
          style={{ inset: '-14px', border: `1px solid ${color}22`, animation: 'halo-pulse 2.5s ease-in-out 0.8s infinite' }}
        />
        <div
          className="w-28 h-28 rounded-full flex items-center justify-center"
          style={{ background: `${color}22`, border: `2px solid ${color}88`, transition: 'background 300ms, border-color 300ms' }}
        >
          <span
            key={icon}
            className="text-5xl"
            style={{ animation: 'drop-bounce 320ms ease-out forwards' }}
          >
            {icon}
          </span>
        </div>
      </div>
      <p
        key={debouncedName}
        className="text-[22px] font-bold text-(--color-text-primary) text-center max-w-[240px]"
        style={{ animation: 'fadeSlideUp 300ms ease-out both' }}
      >
        {name || 'Your goal'}
      </p>
    </div>
  );
}

export function GoalViz2({ targetAmount, targetDate }: { targetAmount: string; targetDate: string }) {
  const amount = parseFloat(targetAmount) || 0;
  const today = new Date();
  const end = targetDate ? new Date(targetDate + 'T00:00:00') : null;
  const months = end
    ? Math.max(1, Math.ceil((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24 * 30.44)))
    : null;
  const monthly = amount && months ? amount / months : null;

  return (
    <div className="flex flex-col items-center justify-center gap-4 w-full h-full px-12">
      <div className="w-full">
        {/* Timeline */}
        <div className="relative w-full h-0.5 bg-(--color-border-default) rounded-full mb-12">
          <div
            className="absolute left-0 top-0 h-full rounded-full"
            style={{
              width: amount > 0 ? '100%' : '6px',
              background: 'var(--color-accent)',
              transition: 'width 600ms ease-out',
            }}
          />
          {/* Start dot */}
          <div className="absolute -top-1.5 left-0 w-3 h-3 rounded-full bg-(--color-accent)" />
          {/* End flag */}
          {end && (
            <div className="absolute flex flex-col items-center gap-1" style={{ right: 0, bottom: '8px', transform: 'translateX(50%)' }}>
              <div className="text-[10px] text-(--color-accent) uppercase tracking-widest whitespace-nowrap">
                {end.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
              </div>
              <div className="w-0.5 h-8 bg-(--color-accent)" />
              <div className="w-3 h-3 rounded-full bg-(--color-accent)" />
            </div>
          )}
        </div>

        {/* Amount */}
        <p className="text-[44px] font-bold font-(--font-mono) text-(--color-text-primary) leading-none">
          {amount > 0 ? (
            <span
              key={targetAmount}
              style={{ display: 'inline-block', animation: 'countUp 300ms ease-out forwards' }}
            >
              ${amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </span>
          ) : (
            <span className="text-(--color-text-disabled)">$0</span>
          )}
        </p>

        {/* Monthly breakdown */}
        {monthly !== null && (
          <p
            key={`${targetAmount}-${targetDate}`}
            className="text-[13px] text-(--color-text-secondary) mt-3"
            style={{ animation: 'fadeIn 400ms ease-out forwards' }}
          >
            ~${monthly.toLocaleString(undefined, { maximumFractionDigits: 0 })}/mo &times; {months} mo
          </p>
        )}
      </div>
    </div>
  );
}

export function GoalViz3({ selected }: { selected: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center gap-6 w-full h-full">
      <svg width="160" height="160" viewBox="0 0 120 120">
        {/* Vault door */}
        <rect x="15" y="20" width="90" height="80" rx="10" ry="10"
          fill="var(--color-overlay)"
          stroke={selected ? 'var(--color-accent)' : 'var(--color-border-strong)'}
          strokeWidth="2.5"
          style={{ transition: 'stroke 400ms' }}
        />
        {/* Dial ring */}
        <circle cx="60" cy="62" r="22"
          fill="var(--color-elevated)"
          stroke={selected ? 'var(--color-accent)' : 'var(--color-border-default)'}
          strokeWidth="2"
          style={{ transition: 'stroke 400ms' }}
        />
        {/* Dial center */}
        <circle cx="60" cy="62" r="5"
          fill={selected ? 'var(--color-accent)' : 'var(--color-border-strong)'}
          style={{ transition: 'fill 400ms' }}
        />
        {/* Dial tick marks */}
        {[0, 60, 120, 180, 240, 300].map((deg, i) => {
          const rad = (deg * Math.PI) / 180;
          return (
            <line key={i}
              x1={60 + 16 * Math.cos(rad)} y1={62 + 16 * Math.sin(rad)}
              x2={60 + 21 * Math.cos(rad)} y2={62 + 21 * Math.sin(rad)}
              stroke={selected ? 'var(--color-accent)' : 'var(--color-border-default)'}
              strokeWidth="1.5"
              style={{ transition: 'stroke 400ms' }}
            />
          );
        })}
        {/* Checkmark when selected */}
        {selected && (
          <polyline
            points="43,62 55,74 79,48"
            fill="none"
            stroke="var(--color-accent)"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray="50"
            style={{ animation: 'checkTick 400ms ease-out forwards' }}
          />
        )}
        {/* Handle */}
        <rect x="86" y="48" width="10" height="20" rx="4"
          fill="none"
          stroke={selected ? 'var(--color-accent)' : 'var(--color-border-default)'}
          strokeWidth="2"
          style={{ transition: 'stroke 400ms' }}
        />
      </svg>
      <p className="text-[11px] uppercase tracking-widest text-(--color-text-tertiary)">
        {selected ? 'Savings account locked in' : 'Select a savings account'}
      </p>
    </div>
  );
}

export function GoalViz4({
  accounts,
  spendingIds,
}: {
  accounts: PlaidAccountInfo[];
  spendingIds: Set<string>;
}) {
  const CX = 110, CY = 110;
  const R1 = 38, R2 = 68, R3 = 95;
  const blips = accounts.map((a, i) => {
    const angle = (i / Math.max(accounts.length, 1)) * 2 * Math.PI - Math.PI / 2;
    return {
      id: a.plaid_account_id,
      x: CX + R2 * Math.cos(angle),
      y: CY + R2 * Math.sin(angle),
      selected: spendingIds.has(a.plaid_account_id),
    };
  });

  return (
    <div className="flex flex-col items-center justify-center w-full h-full">
      <svg width="220" height="220" viewBox="0 0 220 220">
        {/* Radar rings */}
        {[R1, R2, R3].map((r, i) => (
          <circle key={i} cx={CX} cy={CY} r={r}
            fill="none" stroke="var(--color-border-default)" strokeWidth="1" opacity="0.5"
          />
        ))}
        {/* Cross hairs */}
        <line x1={CX - 8} y1={CY} x2={CX + 8} y2={CY} stroke="var(--color-border-strong)" strokeWidth="1" />
        <line x1={CX} y1={CY - 8} x2={CX} y2={CY + 8} stroke="var(--color-border-strong)" strokeWidth="1" />
        {/* Sweep arm — wrapped in g to rotate around radar center */}
        <g style={{ transformOrigin: `${CX}px ${CY}px`, animation: 'orbit-spin 3s linear infinite' }}>
          <line x1={CX} y1={CY} x2={CX} y2={CY - R3}
            stroke="var(--color-accent)" strokeWidth="1.5" opacity="0.5"
          />
        </g>
        {/* Account blips */}
        {blips.map(b => (
          <g key={b.id}>
            <circle cx={b.x} cy={b.y} r={b.selected ? 6 : 4}
              fill={b.selected ? 'var(--color-accent)' : 'var(--color-border-strong)'}
              style={{ transition: 'all 300ms' }}
            />
            {b.selected && (
              <circle
                key={`ping-${b.id}-${spendingIds.size}`}
                cx={b.x} cy={b.y} r="6"
                fill="none" stroke="var(--color-accent)" strokeWidth="1.5"
                style={{
                  transformBox: 'fill-box',
                  transformOrigin: 'center',
                  animation: 'radar-ping 1.5s ease-out infinite',
                } as React.CSSProperties}
              />
            )}
          </g>
        ))}
        {/* Center dot */}
        <circle cx={CX} cy={CY} r="5" fill="var(--color-accent)" />
      </svg>
      <p className="text-[11px] uppercase tracking-widest text-(--color-text-tertiary) -mt-2">
        {spendingIds.size} account{spendingIds.size !== 1 ? 's' : ''} tracking
      </p>
    </div>
  );
}

export function GoalViz5({
  icon,
  name,
  targetAmount,
  targetDate,
  savingsAccount,
}: {
  icon: string;
  name: string;
  targetAmount: string;
  targetDate: string;
  savingsAccount: PlaidAccountInfo | null;
}) {
  const amount = parseFloat(targetAmount) || 0;
  const dateLabel = targetDate
    ? new Date(targetDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : null;

  return (
    <div
      key={`${icon}-${name}-${targetAmount}-${targetDate}`}
      className="flex flex-col items-center justify-center w-full h-full"
      style={{ animation: 'wizard-pop-in 200ms ease-out forwards' }}
    >
      <div className="w-72 bg-(--color-overlay) border border-(--color-border-default) rounded-2xl p-6 flex flex-col gap-5">
        <div className="flex items-center gap-3">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl shrink-0"
            style={{ background: 'var(--color-accent-glow)', border: '1px solid var(--color-accent)' }}
          >
            {icon}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[16px] font-bold text-(--color-text-primary) truncate">{name || 'My Goal'}</p>
            {dateLabel && (
              <p className="text-[11px] text-(--color-text-secondary)">by {dateLabel}</p>
            )}
          </div>
        </div>

        {amount > 0 && (
          <div>
            <p className="text-[10px] uppercase tracking-widest text-(--color-text-tertiary) mb-1">Target</p>
            <p className="text-[30px] font-bold font-(--font-mono) text-(--color-text-primary)">
              ${amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </p>
          </div>
        )}

        <div className="h-1.5 bg-(--color-border-default) rounded-full overflow-hidden">
          <div className="h-full rounded-full" style={{ width: '0%', background: 'var(--color-accent)' }} />
        </div>

        {savingsAccount && (
          <div className="flex items-center gap-2 pt-1 border-t border-(--color-border-subtle)">
            <Building2 size={11} className="text-(--color-text-tertiary) shrink-0" />
            <p className="text-[11px] text-(--color-text-tertiary) truncate">{savingsAccount.account_name}</p>
          </div>
        )}
      </div>
    </div>
  );
}

export function GoalViz6({
  icon,
  addedBudgets,
}: {
  icon: string;
  addedBudgets: { categoryName: string; limit: number; color: string }[];
}) {
  const CX = 140, CY = 140, R = 88;
  const nodes = addedBudgets.slice(0, 8).map((b, i) => {
    const total = Math.max(addedBudgets.slice(0, 8).length, 1);
    const angle = (i / total) * 2 * Math.PI - Math.PI / 2;
    return { ...b, x: CX + R * Math.cos(angle), y: CY + R * Math.sin(angle) };
  });

  return (
    <div className="flex flex-col items-center justify-center w-full h-full">
      <svg width="280" height="280" viewBox="0 0 280 280">
        {/* Static flow paths */}
        {nodes.map((n, i) => {
          const mx = (n.x + CX) / 2;
          const d = `M ${n.x} ${n.y} Q ${mx} ${n.y} ${CX} ${CY}`;
          return (
            <path key={`path-${i}`} d={d} fill="none"
              stroke={n.color} strokeWidth="1.5" opacity="0.25"
            />
          );
        })}

        {/* Animated flow dots */}
        {nodes.map((n, i) => {
          const mx = (n.x + CX) / 2;
          const pathStr = `M ${n.x} ${n.y} Q ${mx} ${n.y} ${CX} ${CY}`;
          return (
            <circle key={`dot-${i}`} r="4"
              fill={n.color}
              style={{
                offsetPath: `path('${pathStr}')`,
                animation: `flow-dot 1.8s ease-in-out ${i * 280}ms infinite`,
              } as React.CSSProperties}
            />
          );
        })}

        {/* Budget node circles */}
        {nodes.map((n, i) => (
          <g key={`node-${i}`}>
            <circle cx={n.x} cy={n.y} r="22"
              fill="var(--color-elevated)" stroke={n.color} strokeWidth="1.5"
            />
            <text x={n.x} y={n.y + 4} textAnchor="middle" fontSize="9"
              fill="var(--color-text-secondary)" fontFamily="var(--font-mono)"
            >
              ${Math.round(n.limit)}
            </text>
          </g>
        ))}

        {/* Center goal */}
        <circle cx={CX} cy={CY} r="30"
          fill="var(--color-overlay)" stroke="var(--color-accent)" strokeWidth="2"
          style={{ animation: 'halo-pulse 2.5s ease-in-out infinite' }}
        />
        <text x={CX} y={CY + 9} textAnchor="middle" fontSize="24">{icon}</text>
      </svg>

      {addedBudgets.length === 0 && (
        <p className="text-[11px] uppercase tracking-widest text-(--color-text-tertiary) -mt-4">
          Budgets added here will flow to your goal
        </p>
      )}
    </div>
  );
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function CheckMark() {
  return (
    <svg width="8" height="6" viewBox="0 0 8 6" fill="none">
      <path d="M1 3L3 5L7 1" stroke="var(--color-base)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function isCredit(a: PlaidAccountInfo): boolean {
  return a.account_subtype === "credit" || a.account_subtype === "credit card";
}

function AccountRow({ account, selected, onToggle }: {
  account: PlaidAccountInfo;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl border text-left transition-colors ${
        selected
          ? "border-(--color-accent) bg-(--color-accent)/8"
          : "border-(--color-border-default) hover:border-(--color-border-strong)"
      }`}
    >
      <div className="flex items-center gap-2.5">
        <Building2 size={13} className="text-(--color-text-secondary) shrink-0" />
        <div>
          <p className="text-[13px] font-medium text-(--color-text-primary)">{account.account_name}</p>
          <p className="text-[10px] text-(--color-text-tertiary)">
            {account.institution_name}{account.account_subtype ? ` · ${account.account_subtype}` : ""}
          </p>
        </div>
      </div>
      {selected && (
        <div className="w-4 h-4 rounded-full bg-(--color-accent) flex items-center justify-center shrink-0">
          <CheckMark />
        </div>
      )}
    </button>
  );
}

interface FullScreenGoalWizardProps {
  onClose: () => void;
  onCreated: (goalId: string) => void;
  activeContext: ActiveContext;
  skipBudgetStep?: boolean;
  zIndex?: number;
}

export function FullScreenGoalWizard({
  onClose,
  onCreated,
  activeContext,
  skipBudgetStep = false,
  zIndex = 50,
}: FullScreenGoalWizardProps) {
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5 | 6>(1);
  const [anim, setAnim] = useState<'wizard-enter-forward' | 'wizard-enter-back'>('wizard-enter-forward');

  // Goal fields
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("🎯");
  const [color, setColor] = useState(COLORS[0]);
  const [targetAmount, setTargetAmount] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [savingsAccount, setSavingsAccount] = useState<PlaidAccountInfo | null>(null);
  const [spendingIds, setSpendingIds] = useState<Set<string>>(new Set());

  const [accounts, setAccounts] = useState<PlaidAccountInfo[]>([]);
  const [accLoading, setAccLoading] = useState(false);
  const [accLoaded, setAccLoaded] = useState(false);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDiscard, setShowDiscard] = useState(false);

  const [showPlaidConnect, setShowPlaidConnect] = useState(false);

  // Step 6 — optional budget creation after goal is saved
  const [createdGoalId, setCreatedGoalId] = useState<string | null>(null);
  const [addedBudgets, setAddedBudgets] = useState<{ categoryId: string; categoryName: string; limit: number; periodType: string }[]>([]);
  const [budgetCategoryId, setBudgetCategoryId] = useState<string | null>(null);
  const [budgetPeriodType, setBudgetPeriodType] = useState<"daily" | "weekly" | "monthly" | "quarterly">("monthly");
  const [budgetAmount, setBudgetAmount] = useState("");
  const [budgetSaving, setBudgetSaving] = useState(false);

  // Prevents spending accounts from being re-auto-selected on every step 4 render
  const step4Initialized = useRef(false);
  const today = new Date().toISOString().split("T")[0];

  useEffect(() => {
    if (step >= 3 && !accLoaded && !accLoading) {
      setAccLoading(true);
      fetch("/api/plaid/accounts")
        .then(r => r.ok ? r.json() : { accounts: [] })
        .then(d => { setAccounts(d.accounts ?? []); setAccLoaded(true); setAccLoading(false); })
        .catch(() => setAccLoading(false));
    }
  }, [step, accLoaded, accLoading]);

  useEffect(() => {
    if (step === 4 && !step4Initialized.current && accounts.length > 0) {
      step4Initialized.current = true;
      setSpendingIds(new Set(
        accounts
          .filter(a => a.plaid_account_id !== savingsAccount?.plaid_account_id)
          .map(a => a.plaid_account_id)
      ));
    }
  }, [step, accounts, savingsAccount]);

  function advanceStep() {
    setAnim('wizard-enter-forward');
    setStep(s => (s + 1) as 1 | 2 | 3 | 4 | 5 | 6);
  }

  function backStep() {
    setAnim('wizard-enter-back');
    setStep(s => (s - 1) as 1 | 2 | 3 | 4 | 5 | 6);
  }

  function goTo(n: 1 | 2 | 3 | 4 | 5 | 6, dir: 'forward' | 'back') {
    setAnim(dir === 'forward' ? 'wizard-enter-forward' : 'wizard-enter-back');
    setStep(n);
  }

  function handleCancel() {
    // Goal already created on step 6 — cancel is equivalent to skipping budgets
    if (step === 6 && createdGoalId) {
      onCreated(createdGoalId);
      return;
    }
    if (name.length > 0) {
      setShowDiscard(true);
    } else {
      onClose();
    }
  }

  async function submit() {
    if (!savingsAccount) return;
    setSaving(true);
    setError(null);
    const body = {
      name,
      icon,
      target_amount: targetAmount ? Number(targetAmount) : null,
      target_date: targetDate || null,
      savings_account: {
        plaid_account_id: savingsAccount.plaid_account_id,
        plaid_item_id: savingsAccount.plaid_item_id,
      },
      spending_accounts: accounts
        .filter(a => spendingIds.has(a.plaid_account_id))
        .map(a => ({ plaid_account_id: a.plaid_account_id, plaid_item_id: a.plaid_item_id })),
      context_type: activeContext.type,
      context_id: activeContext.id,
    };
    const res = await fetch("/api/goals/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const d = await res.json();
      setCreatedGoalId(d.goal_id as string);
      setSaving(false);
      if (skipBudgetStep) {
        onCreated(d.goal_id as string);
      } else {
        setAnim('wizard-enter-forward');
        setStep(6);
      }
    } else {
      const d: unknown = await res.json().catch(() => ({}));
      setError((d as { error?: string }).error ?? "Something went wrong");
      setSaving(false);
    }
  }

  async function addBudget() {
    if (!budgetCategoryId || !createdGoalId) return;
    const limit = parseFloat(budgetAmount);
    if (isNaN(limit) || limit <= 0) return;
    setBudgetSaving(true);
    const { period_start, period_end } = computePeriodBounds(budgetPeriodType);
    const categoryMeta = CATEGORY_META[budgetCategoryId];
    await fetch("/api/budget/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        goal_id: createdGoalId,
        category_id: budgetCategoryId,
        total_limit: limit,
        rollover_enabled: false,
        period_type: budgetPeriodType,
        period_start,
        period_end,
        recurring: true,
        context_type: activeContext.type,
        context_id: activeContext.id,
      }),
    });
    setAddedBudgets(prev => [...prev, {
      categoryId: budgetCategoryId,
      categoryName: categoryMeta?.label ?? budgetCategoryId,
      limit,
      periodType: budgetPeriodType,
    }]);
    setBudgetCategoryId(null);
    setBudgetAmount("");
    setBudgetSaving(false);
  }

  const eligibleSavings  = accounts.filter(a => !isCredit(a));
  const eligibleSpending = accounts.filter(a => a.plaid_account_id !== savingsAccount?.plaid_account_id);

  // ── Discard guard ──────────────────────────────────────────────────────────
  if (showDiscard) {
    return (
      <div className="fixed inset-0 grid grid-cols-1 md:grid-cols-2" style={{ zIndex }}>
        <div className="flex flex-col items-center justify-center h-full px-8 text-center gap-6 bg-(--color-base)">
          <p className="text-[20px] font-bold text-(--color-text-primary)">Discard this goal?</p>
          <p className="text-[14px] text-(--color-text-secondary) max-w-xs">
            Your progress won&apos;t be saved.
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => setShowDiscard(false)}
              className="px-5 py-2.5 text-[14px] border border-(--color-border-default) rounded-xl text-(--color-text-secondary) hover:text-(--color-text-primary) transition-colors"
            >
              Keep editing
            </button>
            <button
              onClick={onClose}
              className="px-5 py-2.5 text-[14px] rounded-xl font-semibold transition-opacity"
              style={{ background: 'var(--color-accent)', color: 'var(--color-base)' }}
              data-testid="discard-confirm-btn"
            >
              Discard
            </button>
          </div>
        </div>
        <div className="hidden md:flex items-center justify-center h-full bg-(--color-elevated)">
          <GoalViz1 icon={icon} name={name} color={color} />
        </div>
      </div>
    );
  }

  function renderStep() {
    switch (step) {
      case 1:
        return (
          <div className="flex flex-col gap-5">
            <p className="text-[28px] font-bold text-(--color-text-primary)">
              What are you saving for?
            </p>
            <div>
              <p className="text-[10px] text-(--color-text-tertiary) uppercase tracking-widest mb-2">Goal name</p>
              <input
                autoFocus
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Emergency fund, New car, Vacation"
                className="w-full bg-(--color-elevated) border border-(--color-border-default) rounded-xl px-4 py-3 text-[14px] text-(--color-text-primary) placeholder:text-(--color-text-tertiary) outline-none focus:border-(--color-accent)"
              />
            </div>
            <div>
              <p className="text-[10px] text-(--color-text-tertiary) uppercase tracking-widest mb-2">Choose an icon</p>
              <div style={{ maxHeight: '280px', overflowY: 'auto' }} className="flex flex-col gap-3 pr-1">
                {EMOJI_CATEGORIES.map(cat => (
                  <div key={cat.label}>
                    <p className="text-[10px] uppercase tracking-widest text-(--color-text-tertiary) mb-1.5">{cat.label}</p>
                    <div className="grid grid-cols-8 gap-1">
                      {cat.emojis.map(e => (
                        <button
                          key={e}
                          type="button"
                          onClick={() => setIcon(e)}
                          className={`text-[20px] rounded-lg p-1 transition-colors ${
                            icon === e
                              ? 'bg-(--color-accent)/20 ring-1 ring-(--color-accent)'
                              : 'hover:bg-(--color-border-default)'
                          }`}
                        >
                          {e}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <p className="text-[10px] text-(--color-text-tertiary) uppercase tracking-widest mb-2">Icon color</p>
              <div className="flex gap-2">
                {COLORS.map(c => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className="w-7 h-7 rounded-full transition-transform hover:scale-110"
                    style={{
                      background: c,
                      border: color === c ? '2px solid white' : '2px solid transparent',
                      outline: color === c ? `2px solid ${c}` : 'none',
                      outlineOffset: '1px',
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
        );

      case 2:
        return (
          <div className="flex flex-col gap-6">
            <div>
              <p className="text-[28px] font-bold text-(--color-text-primary)">What&apos;s your target?</p>
              <p className="text-[13px] text-(--color-text-secondary) mt-2">
                Both are optional — skip if this is an ongoing goal.
              </p>
            </div>
            <div className="flex flex-col gap-4">
              <div>
                <p className="text-[10px] text-(--color-text-tertiary) uppercase tracking-widest mb-2">Target amount</p>
                <div className="flex items-center gap-3 bg-(--color-elevated) border border-(--color-border-default) rounded-xl px-4 py-3 focus-within:border-(--color-accent)">
                  <span className="text-[14px] text-(--color-text-tertiary)">$</span>
                  <input
                    value={targetAmount}
                    onChange={e => setTargetAmount(e.target.value)}
                    placeholder="0.00"
                    type="number"
                    min="1"
                    step="0.01"
                    className="flex-1 bg-transparent text-[14px] text-(--color-text-primary) placeholder:text-(--color-text-tertiary) outline-none"
                  />
                </div>
              </div>
              <div>
                <p className="text-[10px] text-(--color-text-tertiary) uppercase tracking-widest mb-2">Target date</p>
                <input
                  value={targetDate}
                  onChange={e => setTargetDate(e.target.value)}
                  type="date"
                  min={today}
                  className="w-full bg-(--color-elevated) border border-(--color-border-default) rounded-xl px-4 py-3 text-[14px] text-(--color-text-primary) outline-none focus:border-(--color-accent) scheme-dark"
                />
              </div>
            </div>
          </div>
        );

      case 3:
        return (
          <div className="flex flex-col gap-5">
            <div>
              <p className="text-[28px] font-bold text-(--color-text-primary)">Where are you saving to?</p>
              <p className="text-[13px] text-(--color-text-secondary) mt-2">
                Pick the account where your savings will live.
              </p>
            </div>
            {accLoading ? (
              <div className="flex items-center gap-2 text-(--color-text-tertiary) text-[13px] py-4">
                <RefreshCw size={12} className="animate-spin" /> Loading accounts&hellip;
              </div>
            ) : eligibleSavings.length === 0 ? (
              <p className="text-[13px] text-(--color-text-tertiary) py-4">
                No savings accounts found. Connect one below.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {eligibleSavings.map(a => (
                  <AccountRow
                    key={a.plaid_account_id}
                    account={a}
                    selected={savingsAccount?.plaid_account_id === a.plaid_account_id}
                    onToggle={() => {
                      setSavingsAccount(a);
                      setSpendingIds(prev => {
                        const next = new Set(prev);
                        next.delete(a.plaid_account_id);
                        return next;
                      });
                    }}
                  />
                ))}
              </div>
            )}
            {!accLoading && (
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => setShowPlaidConnect(s => !s)}
                  className="text-[12px] text-(--color-accent) hover:opacity-80 transition-opacity mt-2 text-left"
                >
                  + Connect a different account →
                </button>
                {showPlaidConnect && (
                  <PlaidConnectButton
                    onSuccess={() => { setAccLoaded(false); setShowPlaidConnect(false); }}
                  />
                )}
              </div>
            )}
          </div>
        );

      case 4: {
        const allSelected = eligibleSpending.length > 0 &&
          eligibleSpending.every(a => spendingIds.has(a.plaid_account_id));
        return (
          <div className="flex flex-col gap-5">
            <div>
              <p className="text-[28px] font-bold text-(--color-text-primary)">Which accounts track spending?</p>
              <p className="text-[13px] text-(--color-text-secondary) mt-2">
                We&apos;ll watch these for transactions that count against your budgets.
              </p>
            </div>
            <div className="flex items-center justify-between">
              <p className="text-[10px] text-(--color-text-tertiary) uppercase tracking-widest">Accounts</p>
              {eligibleSpending.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    if (allSelected) {
                      setSpendingIds(new Set());
                    } else {
                      setSpendingIds(new Set(eligibleSpending.map(a => a.plaid_account_id)));
                    }
                  }}
                  className="text-[10px] text-(--color-text-secondary) hover:text-(--color-text-primary) transition-colors"
                >
                  {allSelected ? "Deselect all" : "Select all"}
                </button>
              )}
            </div>
            {accLoading ? (
              <div className="flex items-center gap-2 text-(--color-text-tertiary) text-[13px]">
                <RefreshCw size={12} className="animate-spin" /> Loading&hellip;
              </div>
            ) : eligibleSpending.length === 0 ? (
              <div className="flex flex-col gap-3">
                <p className="text-[13px] text-(--color-text-tertiary)">
                  No additional accounts available for spending tracking.
                </p>
                <p className="text-[11px] text-(--color-text-tertiary)">
                  {"We'll"} use your connected account to track spending until you add more.
                </p>
                <PlaidConnectButton onSuccess={() => setAccLoaded(false)} />
                <p className="text-[11px] text-(--color-text-tertiary)">
                  You can also skip this and connect more accounts later.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {eligibleSpending.map(a => (
                  <AccountRow
                    key={a.plaid_account_id}
                    account={a}
                    selected={spendingIds.has(a.plaid_account_id)}
                    onToggle={() => {
                      setSpendingIds(prev => {
                        const next = new Set(prev);
                        prev.has(a.plaid_account_id) ? next.delete(a.plaid_account_id) : next.add(a.plaid_account_id);
                        return next;
                      });
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        );
      }

      case 5: {
        const spendingAccounts = accounts.filter(a => spendingIds.has(a.plaid_account_id));
        return (
          <div className="flex flex-col gap-5">
            <div>
              <p className="text-[28px] font-bold text-(--color-text-primary)">Looks good?</p>
              <p className="text-[13px] text-(--color-text-secondary) mt-2">Review your goal before creating it.</p>
            </div>

            <div className="bg-(--color-elevated) border border-(--color-border-default) rounded-xl divide-y divide-(--color-border-default)">
              <div className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{icon}</span>
                  <div>
                    <p className="text-[14px] font-semibold text-(--color-text-primary)">{name}</p>
                    {(targetAmount || targetDate) && (
                      <p className="text-[13px] text-(--color-text-secondary)">
                        {targetAmount ? `$${formatMoney(Number(targetAmount))}` : ""}
                        {targetAmount && targetDate ? " · " : ""}
                        {targetDate
                          ? `by ${new Date(targetDate + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`
                          : ""}
                      </p>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => goTo(2, 'back')}
                  className="text-[10px] text-(--color-text-secondary) hover:text-(--color-text-primary) flex items-center gap-0.5"
                >
                  Edit <ChevronRight size={10} />
                </button>
              </div>

              <div className="px-4 py-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] text-(--color-text-tertiary) uppercase tracking-widest">Savings account</p>
                  <button
                    onClick={() => goTo(3, 'back')}
                    className="text-[10px] text-(--color-text-secondary) hover:text-(--color-text-primary) flex items-center gap-0.5"
                  >
                    Edit <ChevronRight size={10} />
                  </button>
                </div>
                {savingsAccount && (
                  <div className="flex items-center gap-2">
                    <Building2 size={12} className="text-(--color-text-secondary) shrink-0" />
                    <div>
                      <p className="text-[13px] text-(--color-text-primary)">{savingsAccount.account_name}</p>
                      <p className="text-[10px] text-(--color-text-tertiary)">
                        {savingsAccount.institution_name}
                        {savingsAccount.account_subtype ? ` · ${savingsAccount.account_subtype}` : ""}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              <div className="px-4 py-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] text-(--color-text-tertiary) uppercase tracking-widest">
                    Spending accounts ({spendingAccounts.length})
                  </p>
                  <button
                    onClick={() => goTo(4, 'back')}
                    className="text-[10px] text-(--color-text-secondary) hover:text-(--color-text-primary) flex items-center gap-0.5"
                  >
                    Edit <ChevronRight size={10} />
                  </button>
                </div>
                <div className="flex flex-col gap-1.5">
                  {spendingAccounts.map(a => (
                    <div key={a.plaid_account_id} className="flex items-center gap-2">
                      <Building2 size={12} className="text-(--color-text-secondary) shrink-0" />
                      <div>
                        <p className="text-[13px] text-(--color-text-primary)">{a.account_name}</p>
                        <p className="text-[10px] text-(--color-text-tertiary)">
                          {a.institution_name}
                          {a.account_subtype ? ` · ${a.account_subtype}` : ""}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {error && <p className="text-[13px] text-(--color-danger)">{error}</p>}
          </div>
        );
      }

      case 6: {
        return (
          <div className="flex flex-col gap-5">
            <div>
              <p className="text-[28px] font-bold text-(--color-text-primary)">One more thing&hellip;</p>
              <p className="text-[13px] text-(--color-text-secondary) mt-2">
                Leftover from each budget flows toward this goal. You can skip and set these up later.
              </p>
            </div>

            {addedBudgets.length > 0 && (
              <div className="flex flex-col gap-1.5">
                {addedBudgets.map((b, i) => (
                  <div key={i} className="flex items-center justify-between px-3 py-2 bg-(--color-elevated) border border-(--color-border-default) rounded-xl">
                    <span className="text-[13px] text-(--color-text-primary)">{b.categoryName}</span>
                    <div className="flex items-center gap-2 text-[13px] text-(--color-text-secondary)">
                      <span className="capitalize">{b.periodType}</span>
                      <span className="font-(--font-mono) text-(--color-text-primary)">${formatMoney(b.limit)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div>
              <p className="text-[10px] text-(--color-text-tertiary) uppercase tracking-widest mb-2">Category</p>
              <div className="flex flex-wrap gap-2">
                {STEP6_CATEGORIES.map(c => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setBudgetCategoryId(c.id)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[13px] border transition-colors ${
                      budgetCategoryId === c.id
                        ? "text-(--color-text-primary)"
                        : "border-(--color-border-default) text-(--color-text-secondary) hover:text-(--color-text-primary)"
                    }`}
                    style={budgetCategoryId === c.id ? { borderColor: c.color, background: c.color + "22" } : {}}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-[10px] text-(--color-text-tertiary) uppercase tracking-widest mb-2">Period</p>
              <div className="flex gap-2">
                {(["daily", "weekly", "monthly", "quarterly"] as const).map(pt => (
                  <button
                    key={pt}
                    type="button"
                    onClick={() => setBudgetPeriodType(pt)}
                    className={`flex-1 py-1.5 text-[13px] rounded-full border transition-colors capitalize ${
                      budgetPeriodType === pt
                        ? "border-(--color-accent) bg-(--color-accent)/8 text-(--color-text-primary)"
                        : "border-(--color-border-default) text-(--color-text-secondary) hover:text-(--color-text-primary)"
                    }`}
                  >
                    {pt.charAt(0).toUpperCase() + pt.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-[10px] text-(--color-text-tertiary) uppercase tracking-widest mb-2">Limit</p>
              <div className="flex items-center gap-3 bg-(--color-elevated) border border-(--color-border-default) rounded-xl px-4 py-3 focus-within:border-(--color-accent)">
                <span className="text-[14px] text-(--color-text-tertiary)">$</span>
                <input
                  value={budgetAmount}
                  onChange={e => setBudgetAmount(e.target.value)}
                  placeholder="0.00"
                  type="number"
                  min="1"
                  step="0.01"
                  className="flex-1 bg-transparent text-[14px] text-(--color-text-primary) placeholder:text-(--color-text-tertiary) outline-none"
                />
              </div>
            </div>

            <button
              type="button"
              onClick={addBudget}
              disabled={!budgetCategoryId || !budgetAmount || budgetSaving}
              className="w-full py-2.5 text-[14px] font-medium border border-(--color-border-default) rounded-xl text-(--color-text-secondary) hover:text-(--color-text-primary) disabled:opacity-30 transition-colors"
            >
              {budgetSaving ? "Adding…" : "+ Add budget"}
            </button>
          </div>
        );
      }
    }
  }

  function renderCTA() {
    if (step === 5) {
      return (
        <button
          onClick={createdGoalId ? () => goTo(6, 'forward') : submit}
          disabled={saving}
          className="flex-1 py-2.5 rounded-xl text-[14px] font-semibold disabled:opacity-30 transition-opacity flex items-center justify-center gap-2"
          style={{ background: 'var(--color-accent)', color: 'var(--color-base)' }}
          data-testid="wizard-create-btn"
        >
          {saving
            ? <><RefreshCw size={13} className="animate-spin" /> Creating&hellip;</>
            : createdGoalId ? "Goal created ✓" : "Create goal"}
        </button>
      );
    }
    if (step === 6) {
      return (
        <button
          type="button"
          onClick={() => createdGoalId && onCreated(createdGoalId)}
          className="flex-1 py-2.5 rounded-xl text-[14px] font-semibold transition-opacity"
          style={{ background: 'var(--color-accent)', color: 'var(--color-base)' }}
          data-testid="wizard-finish-btn"
        >
          {addedBudgets.length === 0 ? "Skip for now" : "Done →"}
        </button>
      );
    }
    const disabled =
      (step === 1 && name.trim().length < 2) ||
      (step === 3 && !savingsAccount) ||
      (step === 4 && spendingIds.size === 0 && eligibleSpending.length > 0);
    return (
      <button
        onClick={() => {
          if (step === 4 && eligibleSpending.length === 0 && savingsAccount) {
            setSpendingIds(new Set([savingsAccount.plaid_account_id]));
          }
          advanceStep();
        }}
        disabled={disabled}
        className="flex-1 py-2.5 rounded-xl text-[14px] font-semibold disabled:opacity-30 transition-opacity"
        style={{ background: 'var(--color-accent)', color: 'var(--color-base)' }}
      >
        {step === 2 && !targetAmount && !targetDate ? "Skip for now" : "Continue →"}
      </button>
    );
  }

  return (
    <div className="fixed inset-0 grid grid-cols-1 md:grid-cols-2" style={{ zIndex }}>

      {/* LEFT — questions + nav */}
      <div className="flex flex-col justify-between px-10 py-10 bg-(--color-base) overflow-y-auto">

        {/* Progress dots */}
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

        {/* Animated step content */}
        <div key={step} className={`flex-1 flex flex-col justify-center py-8 ${anim}`}>
          {renderStep()}
        </div>

        {/* Nav */}
        <div className="flex flex-col gap-3">
          <div className="flex gap-3">
            {step > 1 && step !== 6 && (
              <button
                onClick={backStep}
                className="flex-1 py-2.5 rounded-xl text-[14px] border border-(--color-border-default) text-(--color-text-secondary) hover:text-(--color-text-primary) transition-colors"
              >
                {"←"} Back
              </button>
            )}
            {renderCTA()}
          </div>
          {step !== 6 && (
            <button
              onClick={handleCancel}
              className="text-center text-[12px] text-(--color-text-tertiary) hover:text-(--color-text-primary) transition-colors"
            >
              Cancel
            </button>
          )}
        </div>

      </div>

      {/* RIGHT — viz */}
      <div className="hidden md:flex flex-col items-center justify-center h-full bg-(--color-elevated)">
        {step === 1 && <GoalViz1 icon={icon} name={name} color={color} />}
        {step === 2 && <GoalViz2 targetAmount={targetAmount} targetDate={targetDate} />}
        {step === 3 && <GoalViz3 selected={savingsAccount !== null} />}
        {step === 4 && <GoalViz4 accounts={eligibleSpending} spendingIds={spendingIds} />}
        {step === 5 && (
          <GoalViz5
            icon={icon}
            name={name}
            targetAmount={targetAmount}
            targetDate={targetDate}
            savingsAccount={savingsAccount}
          />
        )}
        {step === 6 && (
          <GoalViz6
            icon={icon}
            addedBudgets={addedBudgets.map(b => ({
              ...b,
              color: CATEGORY_META[b.categoryId]?.hex ?? '#888',
            }))}
          />
        )}
      </div>

    </div>
  );
}
