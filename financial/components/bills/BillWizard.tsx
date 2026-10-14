"use client";

import { useState, useEffect, useCallback } from "react";
import type { Bill } from "@/components/bills/BillsWidget";
import { MiniDebtWizard } from "@/components/debts/MiniDebtWizard";
import { EMOJI_CATEGORIES } from "@/lib/constants/emojis";

// ─── Constants ─────────────────────────────────────────────────────────────────

const COLORS = ['#00D4AA','#60a5fa','#a78bfa','#fb923c','#f472b6','#facc15','#34d399','#f87171'];

// "Every 2 weeks" maps to weekly — computeNextDueDate in /api/bills/route.ts does not handle biweekly
const FREQ_OPTIONS: { label: string; value: WizardState['recurrence']; sub: string }[] = [
  { label: 'Monthly',  value: 'monthly',  sub: 'Most common' },
  { label: 'Weekly',   value: 'weekly',   sub: 'Every week' },
  { label: 'Yearly',   value: 'yearly',   sub: 'Once a year' },
  { label: 'One-time', value: 'one-time', sub: "Doesn't repeat" },
];

// ─── Types ─────────────────────────────────────────────────────────────────────

interface BillWizardProps {
  onSuccess: (bill: Bill) => void;
  onClose: () => void;
  showDebtStep?: boolean;
  zIndex?: number;
}

interface WizardState {
  name: string;
  emoji: string | null;
  color: string;
  amount: string;
  due_day: string;        // '0' = Varies; API does not accept 0, POST substitutes 1
  recurrence: 'monthly' | 'weekly' | 'yearly' | 'one-time';
  linked_debt_id: string | null;  // UI only — no column on bills table yet (future migration)
}

interface DebtSummary {
  id: string;
  name: string;
  debt_type: string;
  current_balance: number;
}


// ─── Helpers ───────────────────────────────────────────────────────────────────

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}

function BillAvatar({ emoji, color, name, size = 56 }: {
  emoji: string | null;
  color: string;
  name: string;
  size?: number;
}) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: color + '33',
        border: `2px solid ${color}55`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: emoji ? size * 0.55 : size * 0.45,
        fontWeight: emoji ? 'normal' : 700,
        color: emoji ? undefined : color,
        flexShrink: 0,
      }}
    >
      {emoji ?? (name.charAt(0).toUpperCase() || '?')}
    </div>
  );
}

// ─── Left panel ────────────────────────────────────────────────────────────────

function CountUpAmount({ target, delay = 300 }: { target: number; delay?: number }) {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    const DURATION = 1800;
    let rafId = 0;
    let startTime: number | null = null;
    const timeoutId = setTimeout(() => {
      function tick(now: number) {
        if (startTime === null) startTime = now;
        const t = Math.min((now - startTime) / DURATION, 1);
        const eased = 1 - Math.pow(1 - t, 3);
        setDisplay(target * eased);
        if (t < 1) rafId = requestAnimationFrame(tick);
      }
      rafId = requestAnimationFrame(tick);
    }, delay);
    return () => { clearTimeout(timeoutId); cancelAnimationFrame(rafId); };
  }, [target, delay]);

  const whole = Math.floor(display);
  const cents = Math.floor((display % 1) * 100);
  return <>{`$${whole.toLocaleString('en-US')}.${String(cents).padStart(2, '0')}`}</>;
}

interface BillWizardLeftPanelProps {
  step: number;
  name: string;
  emoji: string | null;
  color: string;
  amount: string;
  due_day: string;
  recurrence: WizardState['recurrence'];
  linked: boolean;
}


const RECURRENCE_LABEL: Record<WizardState['recurrence'], string> = {
  monthly: 'month', weekly: 'week', yearly: 'year', 'one-time': 'once',
};

function BillWizardLeftPanel({ step, name, emoji, color, amount, due_day, recurrence, linked }: BillWizardLeftPanelProps) {
  const dueDayText = due_day === '0' ? 'Varies' : `Due on the ${ordinal(parseInt(due_day, 10))}`;
  const amountNum = parseFloat(amount);
  const amountFormatted = !isNaN(amountNum) && amountNum > 0
    ? `$${amountNum.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : '$0.00';

  function renderContent() {
    switch (step) {
      case 1: {
        const feedRows = [
          { icon: '🏠', label: 'Rent',            amount: '$1,200.00', tag: 'Due Jun 1',   tagColor: 'var(--color-warning)' },
          { icon: '🎮', label: 'Xbox Game Pass',  amount: '$14.99',    tag: 'Paid',        tagColor: 'var(--color-success)' },
          { icon: '🎮', label: 'PlayStation Plus', amount: '$17.99',   tag: 'Overdue',     tagColor: 'var(--color-danger)'  },
          { icon: '📺', label: 'Netflix',          amount: '$15.49',   tag: 'Due Jun 12',  tagColor: 'var(--color-warning)' },
          { icon: '🎵', label: 'Spotify',          amount: '$9.99',    tag: 'Paid',        tagColor: 'var(--color-success)' },
          { icon: '☁️', label: 'iCloud Storage',   amount: '$2.99',    tag: 'Paid',        tagColor: 'var(--color-success)' },
          { icon: '🏠', label: 'Rent',             amount: '$1,200.00', tag: 'Due Jun 1',  tagColor: 'var(--color-warning)' },
          { icon: '🎮', label: 'Xbox Game Pass',   amount: '$14.99',   tag: 'Paid',        tagColor: 'var(--color-success)' },
          { icon: '🎮', label: 'PlayStation Plus', amount: '$17.99',   tag: 'Overdue',     tagColor: 'var(--color-danger)'  },
          { icon: '📺', label: 'Netflix',          amount: '$15.49',   tag: 'Due Jun 12',  tagColor: 'var(--color-warning)' },
          { icon: '🎵', label: 'Spotify',          amount: '$9.99',    tag: 'Paid',        tagColor: 'var(--color-success)' },
          { icon: '☁️', label: 'iCloud Storage',   amount: '$2.99',    tag: 'Paid',        tagColor: 'var(--color-success)' },
        ];
        return (
          <div className="flex-1 flex items-center justify-center overflow-hidden">
            <div className="relative bg-(--color-base) border border-(--color-border-default) rounded-xl w-full max-w-sm overflow-hidden"
              style={{ height: 320, animation: 'scaleIn 400ms ease-out both', animationDelay: '100ms' }}>
              {/* scan line */}
              <div className="absolute left-0 right-0 h-[2px] pointer-events-none"
                style={{
                  background: 'linear-gradient(90deg, transparent, var(--color-accent), transparent)',
                  boxShadow: '0 0 12px 2px var(--color-accent)',
                  animation: 'scan-sweep 2.4s linear infinite',
                  zIndex: 10,
                }} />
              {/* scrolling feed */}
              <div style={{ animation: 'feed-scroll 8s linear infinite' }}>
                {feedRows.map((row, i) => (
                  <div key={i} className="flex items-center gap-3 px-4 py-3 border-b border-(--color-border-subtle)">
                    <span className="text-[22px] w-8 text-center shrink-0">{row.icon}</span>
                    <p className="flex-1 text-[13px] font-medium text-(--color-text-primary) truncate">{row.label}</p>
                    <p className="text-[13px] font-(--font-mono) text-(--color-text-secondary) shrink-0">{row.amount}</p>
                    <span className="text-[10px] px-2 py-0.5 rounded-full shrink-0"
                      style={{ background: row.tagColor + '22', color: row.tagColor }}>{row.tag}</span>
                  </div>
                ))}
              </div>
              {/* fade edges */}
              <div className="absolute inset-x-0 top-0 h-10 pointer-events-none"
                style={{ background: 'linear-gradient(to bottom, var(--color-base), transparent)' }} />
              <div className="absolute inset-x-0 bottom-0 h-10 pointer-events-none"
                style={{ background: 'linear-gradient(to top, var(--color-base), transparent)' }} />
            </div>
          </div>
        );
      }

      case 2: {
        // Identity Reveal — ripple on color change, emoji drop-bounce, name char-by-char
        const chars = (name || '…').split('');
        return (
          <div className="flex-1 flex flex-col items-center justify-center gap-6">
            {/* color ripple behind avatar */}
            <div className="relative flex items-center justify-center" style={{ width: 140, height: 140 }}>
              <div
                key={color}
                className="absolute rounded-full"
                style={{
                  width: 140, height: 140,
                  background: color + '22',
                  animation: 'scaleIn 500ms ease-out both',
                }}
              />
              <div
                key={color + '-ring'}
                className="absolute rounded-full"
                style={{
                  width: 116, height: 116,
                  border: `2px solid ${color}44`,
                  animation: 'scaleIn 500ms ease-out both',
                  animationDelay: '80ms',
                }}
              />
              <div style={{ animation: 'drop-bounce 500ms cubic-bezier(0.34,1.56,0.64,1) both', animationDelay: '100ms' }}>
                <BillAvatar key={emoji ?? '_'} emoji={emoji} color={color} name={name} size={80} />
              </div>
            </div>
            {/* name char-by-char */}
            <div className="flex flex-wrap justify-center gap-0 max-w-[260px]">
              {chars.map((ch, i) => (
                <span
                  key={`${name}-${i}`}
                  className="text-[22px] font-bold text-(--color-text-primary)"
                  style={{
                    display: 'inline-block',
                    animation: 'char-reveal 200ms ease-out both',
                    animationDelay: `${120 + i * 40}ms`,
                    whiteSpace: ch === ' ' ? 'pre' : 'normal',
                  }}
                >
                  {ch}
                </span>
              ))}
            </div>
            <p className="text-[13px] text-(--color-text-secondary)"
              style={{ animation: 'fadeSlideUp 400ms ease-out both', animationDelay: '300ms' }}>
              Pick an icon and color that fits.
            </p>
          </div>
        );
      }

      case 3: {
        // Calendar — bill amount appears on the selected due day, slides as day changes
        const dueDayNum3 = parseInt(due_day, 10);
        const effectiveDay = dueDayNum3 === 0 ? 1 : dueDayNum3;
        const hasAmount = !isNaN(amountNum) && amountNum > 0;
        // 35 cells: days 1–31 then 4 empty
        const cells = Array.from({ length: 35 }, (_, i) => (i < 31 ? i + 1 : null));
        return (
          <div className="flex-1 flex flex-col items-center justify-center gap-4">
            <div className="bg-(--color-base) border border-(--color-border-default) rounded-xl overflow-hidden w-full max-w-[280px]"
              style={{ animation: 'scaleIn 400ms ease-out both' }}>
              {/* calendar header */}
              <div className="px-4 py-3 border-b border-(--color-border-subtle) flex items-center gap-2">
                <BillAvatar emoji={emoji} color={color} name={name} size={22} />
                <p className="text-[12px] font-medium text-(--color-text-secondary) truncate flex-1">{name || 'Your bill'}</p>
                <span className="text-[11px] text-(--color-text-tertiary) shrink-0">Jun 2025</span>
              </div>
              <div className="p-3">
                {/* day-of-week headers */}
                <div className="grid grid-cols-7 mb-1">
                  {['Su','Mo','Tu','We','Th','Fr','Sa'].map((d, i) => (
                    <p key={i} className="text-[9px] text-(--color-text-tertiary) text-center py-0.5">{d}</p>
                  ))}
                </div>
                {/* day cells */}
                <div className="grid grid-cols-7 gap-0.5">
                  {cells.map((day, i) => {
                    const isSelected = day === effectiveDay;
                    return (
                      <div key={i}
                        className="flex items-center justify-center rounded-md transition-all duration-300"
                        style={{ height: 28, background: isSelected ? color : 'transparent' }}>
                        {day !== null && (
                          <span className="text-[11px] leading-none transition-all duration-300"
                            style={{
                              color: isSelected ? '#0A0A0F' : 'var(--color-text-tertiary)',
                              fontWeight: isSelected ? 700 : 400,
                            }}>
                            {day}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
            {/* animated amount pill */}
            {hasAmount && (
              <div key={`${due_day}-${amount}`}
                className="flex items-center gap-2"
                style={{ animation: 'drop-bounce 320ms cubic-bezier(0.34,1.56,0.64,1) both' }}>
                <div className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
                <p className="text-[14px] font-semibold font-(--font-mono)" style={{ color }}>{amountFormatted}</p>
                <p className="text-[12px] text-(--color-text-tertiary)">on the {ordinal(effectiveDay)}</p>
              </div>
            )}
          </div>
        );
      }

      case 4: {
        // The Orbit — bill avatar at center, satellite orbits at recurrence tempo
        const orbitDuration: Record<WizardState['recurrence'], number | null> = {
          weekly: 1200, monthly: 4500, yearly: 15000, 'one-time': null,
        };
        const orbitLabel: Record<WizardState['recurrence'], { count: string; sub: string }> = {
          weekly:     { count: '52×', sub: 'per year'    },
          monthly:    { count: '12×', sub: 'per year'    },
          yearly:     { count: '1×',  sub: 'per year'    },
          'one-time': { count: '1×',  sub: 'total, ever' },
        };
        const speed = orbitDuration[recurrence];
        const lbl = orbitLabel[recurrence];
        const ORBIT_R = 70;
        return (
          <div className="flex-1 flex flex-col items-center justify-center gap-6">
            <div key={recurrence} className="relative flex items-center justify-center" style={{ width: 192, height: 192 }}>
              {/* ring */}
              <svg className="absolute inset-0 w-full h-full" viewBox="0 0 192 192" fill="none">
                <circle
                  cx="96" cy="96" r={ORBIT_R}
                  stroke={speed === null ? 'var(--color-border-subtle)' : 'var(--color-border-default)'}
                  strokeWidth="1.5"
                  strokeDasharray={speed === null ? '5 8' : undefined}
                  style={{ animation: 'scaleIn 500ms ease-out both' }}
                />
              </svg>
              {/* center avatar */}
              <div style={{ position: 'relative', zIndex: 2, animation: 'scaleIn 400ms ease-out both' }}>
                <BillAvatar emoji={emoji} color={color} name={name} size={54} />
              </div>
              {/* orbiting satellite */}
              {speed !== null && (
                <div
                  className="absolute inset-0"
                  style={{ animation: `orbit-spin ${speed}ms linear infinite` }}
                >
                  <div
                    className="absolute rounded-full"
                    style={{
                      width: 10, height: 10,
                      top: `calc(50% - ${ORBIT_R}px - 5px)`,
                      left: 'calc(50% - 5px)',
                      background: color,
                      boxShadow: `0 0 10px 3px ${color}88`,
                    }}
                  />
                </div>
              )}
              {/* one-time: static checkmark badge */}
              {speed === null && (
                <div
                  className="absolute bottom-5 right-5 w-8 h-8 rounded-full flex items-center justify-center text-[15px]"
                  style={{
                    background: 'var(--color-success)22',
                    border: '1.5px solid var(--color-success)55',
                    animation: 'scaleIn 400ms ease-out both',
                    animationDelay: '250ms',
                  }}
                >
                  ✓
                </div>
              )}
            </div>
            {/* label */}
            <div className="text-center" style={{ animation: 'fadeSlideUp 300ms ease-out both', animationDelay: '200ms' }}>
              <p className="text-[40px] font-bold leading-none" style={{ color }}>{lbl.count}</p>
              <p className="text-[13px] text-(--color-text-secondary) mt-1">{lbl.sub}</p>
            </div>
          </div>
        );
      }

      case 5: {
        // The Bridge — two oscillating cards, SVG line draws when linked
        return (
          <div className="flex-1 flex flex-col items-center justify-center gap-4">
            <div className="relative flex items-end justify-center gap-8" style={{ height: 180 }}>
              {/* Bill card — bobs up */}
              <div className="flex flex-col items-center gap-2"
                style={{ animation: 'float-bob 3s ease-in-out infinite' }}>
                <div className="bg-(--color-base) border border-(--color-border-default) rounded-xl p-4 flex flex-col items-center gap-2 w-24">
                  <BillAvatar emoji={emoji} color={color} name={name} size={36} />
                  <p className="text-[11px] text-(--color-text-secondary) truncate max-w-full text-center">{name || 'Bill'}</p>
                </div>
              </div>

              {/* SVG connector */}
              <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 200 180" preserveAspectRatio="none">
                {linked && (
                  <path
                    key="linked"
                    d="M60,90 C100,60 100,120 140,90"
                    stroke="var(--color-accent)"
                    strokeWidth="2"
                    fill="none"
                    strokeDasharray="100"
                    strokeDashoffset="100"
                    style={{ animation: 'wave-flow 600ms ease-out forwards' }}
                  />
                )}
                {!linked && (
                  <path
                    d="M60,90 C100,60 100,120 140,90"
                    stroke="var(--color-border-strong)"
                    strokeWidth="1.5"
                    fill="none"
                    strokeDasharray="4 6"
                  />
                )}
              </svg>

              {/* Debt card — bobs down */}
              <div className="flex flex-col items-center gap-2"
                style={{ animation: 'float-bob-inv 3s ease-in-out infinite' }}>
                <div className={`bg-(--color-base) border rounded-xl p-4 flex flex-col items-center gap-2 w-24 transition-colors ${linked ? 'border-(--color-accent)' : 'border-(--color-border-default)'}`}>
                  <div className="w-9 h-9 rounded-full flex items-center justify-center text-[18px]"
                    style={{ background: linked ? 'var(--color-accent)22' : 'var(--color-border-default)', color: linked ? 'var(--color-accent)' : 'var(--color-text-tertiary)' }}>
                    {linked ? '🔗' : '?'}
                  </div>
                  <p className="text-[11px] text-center"
                    style={{ color: linked ? 'var(--color-accent)' : 'var(--color-text-tertiary)' }}>
                    {linked ? 'Linked' : 'No debt'}
                  </p>
                </div>
              </div>
            </div>
            <p className="text-[12px] text-(--color-text-tertiary) text-center max-w-[200px]"
              style={{ animation: 'fadeSlideUp 400ms ease-out both' }}>
              {linked ? 'Connected to a debt — your net worth will be more accurate.' : 'Link a debt to connect repayments to your net worth.'}
            </p>
          </div>
        );
      }

      default: {
        // Step 6 — Assembly: components fly in with staggered delays + teal ring
        const amountNum6 = parseFloat(amount);
        const targetAmount = !isNaN(amountNum6) && amountNum6 > 0 ? amountNum6 : 0;
        return (
          <div className="flex-1 flex items-center justify-center">
            <div className="flex flex-col items-center gap-4 w-full max-w-[260px]">
              {/* Avatar + ring */}
              <div className="relative flex items-center justify-center" style={{ width: 96, height: 96 }}>
                <svg className="absolute inset-0" viewBox="0 0 96 96" fill="none">
                  <circle cx="48" cy="48" r="44" stroke="var(--color-border-default)" strokeWidth="2" />
                  <circle
                    cx="48" cy="48" r="44"
                    stroke="var(--color-accent)"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeDasharray="276"
                    strokeDashoffset="276"
                    transform="rotate(-90 48 48)"
                    style={{ animation: 'ring-draw 800ms ease-out forwards', animationDelay: '600ms' }}
                  />
                </svg>
                <div style={{ animation: 'drop-bounce 500ms cubic-bezier(0.34,1.56,0.64,1) both' }}>
                  <BillAvatar emoji={emoji} color={color} name={name} size={64} />
                </div>
              </div>
              {/* name */}
              <p className="text-[22px] font-bold text-(--color-text-primary) text-center"
                style={{ animation: 'fadeSlideRight 300ms ease-out both', animationDelay: '150ms' }}>
                {name || '—'}
              </p>
              {/* amount counting up */}
              <p className="text-[32px] font-bold font-(--font-mono) text-(--color-accent)"
                style={{ animation: 'fadeSlideUp 300ms ease-out both', animationDelay: '250ms' }}>
                <CountUpAmount target={targetAmount} delay={350} />
              </p>
              {/* due date */}
              <p className="text-[13px] text-(--color-text-secondary)"
                style={{ animation: 'fadeSlideUp 300ms ease-out both', animationDelay: '350ms' }}>
                {dueDayText} · {RECURRENCE_LABEL[recurrence]}
              </p>
            </div>
          </div>
        );
      }
    }
  }

  return (
    <div className="bg-(--color-elevated) hidden md:flex flex-col h-full px-10 py-12">
      <div key={step} className="flex flex-col gap-8 h-full" style={{ animation: 'fadeSlideUp 400ms ease-out both' }}>
        {renderContent()}
      </div>
    </div>
  );
}

// ─── Component ─────────────────────────────────────────────────────────────────

export function BillWizard({ onSuccess, onClose, showDebtStep = true, zIndex = 50 }: BillWizardProps) {
  const totalSteps = showDebtStep ? 6 : 5;

  // ── Core wizard state ────────────────────────────────────────────────────────
  const [step, setStep] = useState(1);
  const [anim, setAnim] = useState<'wizard-enter-forward' | 'wizard-enter-back'>('wizard-enter-forward');
  const [form, setForm] = useState<WizardState>({
    name: '',
    emoji: null,
    color: COLORS[0],
    amount: '',
    due_day: '1',
    recurrence: 'monthly',
    linked_debt_id: null,
  });

  // ── Save state ───────────────────────────────────────────────────────────────
  const [saving, setSaving] = useState(false);

  // ── Debt link step state (lifted to component level — key={step} remounts JSX) ──
  const [debtChoice, setDebtChoice] = useState<'yes' | 'no' | null>(null);
  const [debts, setDebts] = useState<DebtSummary[]>([]);
  const [debtsLoading, setDebtsLoading] = useState(false);
  const [showDebtWizard, setShowDebtWizard] = useState(false);

  // ── Validation ───────────────────────────────────────────────────────────────
  const step1Valid = form.name.trim().length > 0;
  const step3Valid = parseFloat(form.amount) > 0;

  // ── Derived for review ───────────────────────────────────────────────────────
  const recurrenceLabel: Record<WizardState['recurrence'], string> = {
    monthly: 'month',
    weekly: 'week',
    yearly: 'year',
    'one-time': 'once',
  };
  const dueDayLabel = form.due_day === '0'
    ? 'Varies'
    : `Due on the ${ordinal(parseInt(form.due_day, 10))}`;
  const linkedDebt = debts.find(d => d.id === form.linked_debt_id);

  // ── Escape key ───────────────────────────────────────────────────────────────
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  // ── Debt fetch ───────────────────────────────────────────────────────────────
  const fetchDebts = useCallback(async () => {
    setDebtsLoading(true);
    try {
      const res = await fetch('/api/debts/summary');
      const d = res.ok ? await res.json() : { debts: [] };
      setDebts(d.debts ?? []);
    } finally {
      setDebtsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (showDebtStep && step === 5) fetchDebts();
  }, [step, showDebtStep, fetchDebts]);

  // ── Navigation ───────────────────────────────────────────────────────────────
  function advanceStep() {
    setAnim('wizard-enter-forward');
    setStep(s => s + 1);
  }

  function backStep() {
    setAnim('wizard-enter-back');
    setStep(s => s - 1);
  }

  // ── Save ─────────────────────────────────────────────────────────────────────
  async function handleSave() {
    setSaving(true);
    try {
      const due = parseInt(form.due_day, 10);
      const res = await fetch('/api/bills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          amount: parseFloat(form.amount),
          due_day: due === 0 ? 1 : due,   // API validates !due_day; 0 is falsy
          recurrence: form.recurrence,
          // category_id omitted — set later via edit form
          // linked_debt_id omitted — no column on bills table yet (future migration)
        }),
      });
      const data = await res.json();
      if (data.bill) onSuccess(data.bill);
      else onClose();
    } catch {
      setSaving(false);
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <>
    <div className="fixed inset-0 grid grid-cols-1 md:grid-cols-2" style={{ zIndex }}>
      <BillWizardLeftPanel
        step={step}
        name={form.name}
        emoji={form.emoji}
        color={form.color}
        amount={form.amount}
        due_day={form.due_day}
        recurrence={form.recurrence}
        linked={form.linked_debt_id !== null}
      />
      <div className="flex flex-col h-full px-10 py-12 bg-(--color-base) overflow-y-auto justify-center">

        {/* Progress dots — totalSteps - 1 (Review has no dot) */}
        <div className="flex items-center gap-2 mb-8">
          {Array.from({ length: totalSteps - 1 }, (_, i) => {
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

        {/* Animated step content — key causes remount on step change, triggering CSS animation fresh */}
        <div key={step} className={anim}>

          {/* ── Step 1 — Name ───────────────────────────────────────────────── */}
          {step === 1 && (
            <div className="flex flex-col gap-4">
              <p className="text-[18px] font-semibold text-(--color-text-primary)">What&apos;s this bill called?</p>
              <input
                autoFocus
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                onKeyDown={e => { if (e.key === 'Enter' && step1Valid) advanceStep(); }}
                placeholder="Netflix, Rent, Car payment..."
                className="w-full bg-(--color-base) border border-(--color-border-default) rounded-lg px-4 py-3 text-[16px] text-(--color-text-primary) placeholder:text-(--color-text-tertiary) outline-none focus:border-(--color-accent)"
              />
              <button
                onClick={advanceStep}
                disabled={!step1Valid}
                className="w-full py-2.5 rounded-lg text-[14px] font-semibold disabled:opacity-30 transition-opacity"
                style={{ background: 'var(--color-accent)', color: 'var(--color-base)' }}
              >
                Continue →
              </button>
            </div>
          )}

          {/* ── Step 2 — Icon & color ────────────────────────────────────────── */}
          {step === 2 && (
            <div className="flex flex-col gap-5">
              <div className="flex flex-col items-center gap-3">
                <BillAvatar emoji={form.emoji} color={form.color} name={form.name} size={64} />
                <p className="text-[18px] font-semibold text-(--color-text-primary)">Pick an icon</p>
              </div>

              <div style={{ maxHeight: '240px', overflowY: 'auto' }} className="flex flex-col gap-3 pr-1">
                {EMOJI_CATEGORIES.map(cat => (
                  <div key={cat.label}>
                    <p className="text-[10px] uppercase tracking-widest text-(--color-text-tertiary) mb-1.5">{cat.label}</p>
                    <div className="grid grid-cols-8 gap-1">
                      {cat.emojis.map(e => (
                        <button
                          key={e}
                          onClick={() => setForm(f => ({ ...f, emoji: f.emoji === e ? null : e }))}
                          className={`text-[20px] rounded-lg p-1 transition-colors ${form.emoji === e ? 'bg-(--color-accent)/20 ring-1 ring-(--color-accent)' : 'hover:bg-(--color-border-default)'}`}
                        >
                          {e}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex gap-2">
                {COLORS.map(c => (
                  <button
                    key={c}
                    onClick={() => setForm(f => ({ ...f, color: c }))}
                    style={{
                      background: c,
                      width: 28,
                      height: 28,
                      borderRadius: '50%',
                      border: form.color === c ? '2px solid white' : '2px solid transparent',
                      flexShrink: 0,
                    }}
                  />
                ))}
              </div>

              <div className="flex gap-3">
                <button onClick={backStep} className="flex-1 py-2.5 rounded-lg text-[13px] border border-(--color-border-default) text-(--color-text-secondary) hover:text-(--color-text-primary) transition-colors">← Back</button>
                <button onClick={advanceStep} className="flex-1 py-2.5 rounded-lg text-[13px] font-semibold" style={{ background: 'var(--color-accent)', color: 'var(--color-base)' }}>Continue →</button>
              </div>
            </div>
          )}

          {/* ── Step 3 — Amount & due date ───────────────────────────────────── */}
          {step === 3 && (
            <div className="flex flex-col gap-5">
              <p className="text-[18px] font-semibold text-(--color-text-primary)">How much is it and when is it due?</p>

              <div className="flex gap-3">
                <div className="flex-1 flex items-center gap-2 bg-(--color-base) border border-(--color-border-default) rounded-lg px-3 py-2.5 focus-within:border-(--color-accent)">
                  <span className="text-[14px] text-(--color-text-tertiary)">$</span>
                  <input
                    autoFocus
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.amount}
                    onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                    placeholder="0.00"
                    className="flex-1 bg-transparent text-[14px] text-(--color-text-primary) placeholder:text-(--color-text-tertiary) outline-none"
                  />
                </div>

                <select
                  value={form.due_day}
                  onChange={e => setForm(f => ({ ...f, due_day: e.target.value }))}
                  className="w-32 bg-(--color-base) border border-(--color-border-default) rounded-lg px-3 py-2.5 text-[13px] text-(--color-text-primary) outline-none focus:border-(--color-accent)"
                >
                  <option value="0">Varies</option>
                  {Array.from({ length: 31 }, (_, i) => i + 1).map(d => (
                    <option key={d} value={String(d)}>Day {d}</option>
                  ))}
                </select>
              </div>

              <div className="flex gap-3">
                <button onClick={backStep} className="flex-1 py-2.5 rounded-lg text-[13px] border border-(--color-border-default) text-(--color-text-secondary) hover:text-(--color-text-primary) transition-colors">← Back</button>
                <button onClick={advanceStep} disabled={!step3Valid} className="flex-1 py-2.5 rounded-lg text-[13px] font-semibold disabled:opacity-30 transition-opacity" style={{ background: 'var(--color-accent)', color: 'var(--color-base)' }}>Continue →</button>
              </div>
            </div>
          )}

          {/* ── Step 4 — Frequency ───────────────────────────────────────────── */}
          {step === 4 && (
            <div className="flex flex-col gap-5">
              <p className="text-[18px] font-semibold text-(--color-text-primary)">How often does this charge appear?</p>
              <div className="grid grid-cols-2 gap-3">
                {FREQ_OPTIONS.map(({ label, value, sub }) => (
                  <button
                    key={value}
                    onClick={() => setForm(f => ({ ...f, recurrence: value }))}
                    className={`p-4 rounded-xl border text-left transition-colors ${form.recurrence === value ? 'border-(--color-accent) bg-(--color-accent)/5' : 'border-(--color-border-default) hover:border-(--color-border-strong)'}`}
                  >
                    <p className="text-[14px] font-semibold text-(--color-text-primary)">{label}</p>
                    <p className="text-[11px] text-(--color-text-tertiary) mt-0.5">{sub}</p>
                  </button>
                ))}
              </div>
              <div className="flex gap-3">
                <button onClick={backStep} className="flex-1 py-2.5 rounded-lg text-[13px] border border-(--color-border-default) text-(--color-text-secondary) hover:text-(--color-text-primary) transition-colors">← Back</button>
                <button onClick={advanceStep} className="flex-1 py-2.5 rounded-lg text-[13px] font-semibold" style={{ background: 'var(--color-accent)', color: 'var(--color-base)' }}>Continue →</button>
              </div>
            </div>
          )}

          {/* ── Step 5 — Debt link (showDebtStep only) ───────────────────────── */}
          {step === 5 && showDebtStep && (
            <div className="flex flex-col gap-5">
              <div>
                <p className="text-[18px] font-semibold text-(--color-text-primary)">Is this bill tied to a debt?</p>
                <p className="text-[12px] text-(--color-text-tertiary) mt-1">For example: a car payment is tied to an auto loan. Linking them gives you a more accurate net worth.</p>
              </div>

              <div className="flex gap-3">
                {(['yes', 'no'] as const).map(choice => (
                  <button
                    key={choice}
                    onClick={() => setDebtChoice(choice)}
                    className={`flex-1 py-3 rounded-xl border text-[14px] font-medium transition-colors ${debtChoice === choice ? 'border-(--color-accent) bg-(--color-accent)/5 text-(--color-accent)' : 'border-(--color-border-default) text-(--color-text-secondary) hover:border-(--color-border-strong)'}`}
                  >
                    {choice === 'yes' ? 'Yes, link a debt' : "No, it's standalone"}
                  </button>
                ))}
              </div>

              {debtChoice === 'yes' && (
                <div className="flex flex-col gap-3">
                  {debtsLoading && <p className="text-[13px] text-(--color-text-tertiary)">Loading debts…</p>}
                  {!debtsLoading && debts.length === 0 && (
                    <p className="text-[13px] text-(--color-text-tertiary)">No debts found.</p>
                  )}
                  {debts.map(d => (
                    <button
                      key={d.id}
                      onClick={() => setForm(f => ({ ...f, linked_debt_id: f.linked_debt_id === d.id ? null : d.id }))}
                      className={`w-full p-3 rounded-lg border text-left flex items-center justify-between transition-colors ${form.linked_debt_id === d.id ? 'border-(--color-accent) bg-(--color-accent)/5' : 'border-(--color-border-default) hover:border-(--color-border-strong)'}`}
                    >
                      <div>
                        <p className="text-[13px] font-medium text-(--color-text-primary)">{d.name}</p>
                        <p className="text-[11px] text-(--color-text-tertiary) capitalize">{d.debt_type.replace('_', ' ')}</p>
                      </div>
                      <p className="text-[13px] font-(--font-mono) text-(--color-text-secondary)">${d.current_balance.toLocaleString()}</p>
                    </button>
                  ))}

                  <button
                    onClick={() => setShowDebtWizard(true)}
                    className="text-[12px] text-(--color-accent) hover:opacity-80 transition-opacity text-left"
                  >
                    Don&apos;t see your debt? Create it →
                  </button>

                </div>
              )}

              <div className="flex gap-3">
                <button onClick={backStep} className="flex-1 py-2.5 rounded-lg text-[13px] border border-(--color-border-default) text-(--color-text-secondary) hover:text-(--color-text-primary) transition-colors">← Back</button>
                <button
                  onClick={advanceStep}
                  disabled={debtChoice === null}
                  className="flex-1 py-2.5 rounded-lg text-[13px] font-semibold disabled:opacity-30 transition-opacity"
                  style={{ background: 'var(--color-accent)', color: 'var(--color-base)' }}
                >
                  Continue →
                </button>
              </div>
            </div>
          )}

          {/* ── Review — last step ───────────────────────────────────────────── */}
          {step === totalSteps && (
            <div className="flex flex-col gap-5">
              <p className="text-[18px] font-semibold text-(--color-text-primary)">Here&apos;s your bill. Does this look right?</p>

              <div className="p-5 rounded-xl border border-(--color-border-default) bg-(--color-base) flex gap-4 items-center">
                <BillAvatar emoji={form.emoji} color={form.color} name={form.name} size={56} />
                <div className="flex-1 min-w-0">
                  <p className="text-[20px] font-bold text-(--color-text-primary) truncate">{form.name || '—'}</p>
                  <p className="text-[14px] text-(--color-text-secondary) mt-0.5">
                    ${parseFloat(form.amount || '0').toFixed(2)} / {recurrenceLabel[form.recurrence]}
                  </p>
                  <p className="text-[12px] text-(--color-text-tertiary) mt-0.5">{dueDayLabel}</p>
                  {linkedDebt && (
                    <p className="text-[11px] text-(--color-accent) mt-1">Linked to: {linkedDebt.name}</p>
                  )}
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={backStep}
                  className="flex-1 py-2.5 rounded-lg text-[13px] border border-(--color-border-default) text-(--color-text-secondary) hover:text-(--color-text-primary) transition-colors"
                >
                  ← Edit
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex-1 py-2.5 rounded-lg text-[13px] font-semibold disabled:opacity-40 transition-opacity"
                  style={{ background: 'var(--color-accent)', color: 'var(--color-base)' }}
                >
                  {saving ? 'Saving…' : 'Save bill →'}
                </button>
              </div>
            </div>
          )}

        </div>

        {/* Cancel link */}
        <button
          onClick={onClose}
          className="text-center text-[12px] text-(--color-text-tertiary) hover:text-(--color-text-primary) transition-colors py-5"
        >
          Cancel
        </button>

      </div>
    </div>

    {showDebtWizard && (
      <MiniDebtWizard
        onSuccess={(debtId) => {
          setForm(f => ({ ...f, linked_debt_id: debtId }));
          setShowDebtWizard(false);
          fetchDebts();
        }}
        onClose={() => setShowDebtWizard(false)}
      />
    )}
    </>
  );
}
