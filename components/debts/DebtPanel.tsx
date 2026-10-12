"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useState } from "react";
import { ChevronLeft, Plus, RefreshCw, Trash2, Pencil, ArrowUp, ArrowDown, AlertTriangle, CreditCard, CheckCircle2, RotateCcw } from "lucide-react";
import { ActiveContext } from "@/lib/goals/types";
import { DebtSummary, DebtType, DEBT_TYPE_META } from "@/lib/debts/types";
import { MiniDebtWizard } from "@/components/debts/MiniDebtWizard";
import { formatMoney } from "@/components/budget/types";
import { StatCard } from "@/components/budget/StatCard";
import { monthsToPayoff } from "@/lib/debts/debtService";

// ─── Math helpers ─────────────────────────────────────────────────────────────

function simulatePayoff(balance: number, apr: number, payment: number) {
  const n = monthsToPayoff(balance, apr, payment);
  if (n === null || payment <= 0) return { months: null, totalInterest: null, payoffDate: null };
  const totalInterest = Math.max(0, n * payment - balance);
  const d = new Date();
  d.setMonth(d.getMonth() + Math.ceil(n));
  return { months: n, totalInterest, payoffDate: d.toISOString().split("T")[0] };
}

function formatMonths(n: number): string {
  const mo = Math.ceil(n);
  if (mo < 12) return `${mo} mo`;
  const yrs = Math.floor(mo / 12);
  const rem = mo % 12;
  return rem > 0 ? `${yrs}y ${rem}mo` : `${yrs}y`;
}

function formatDate(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

const DEBT_ICONS = ["💳", "🏦", "🎓", "🚗", "🏠", "📋", "💵", "🏧"];
const DEBT_TYPES = Object.entries(DEBT_TYPE_META) as [DebtType, { label: string; icon: string }][];

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  activeContext: ActiveContext;
  contextLabel: string;
  onAddAssetForDebt?: (debtId: string) => void;
}

// ─── DebtPanel ────────────────────────────────────────────────────────────────

export interface DebtPanelHandle { triggerCreate: () => void }

const DebtPanel = forwardRef<DebtPanelHandle, Props>(
  function DebtPanel({ activeContext, onAddAssetForDebt }, ref) {
  const ctxParams = `context_type=${activeContext.type}&context_id=${activeContext.id}`;

  const [debts, setDebts]             = useState<DebtSummary[]>([]);
  const [loading, setLoading]         = useState(true);
  const [view, setView]               = useState<"list" | "detail" | "wizard">("list");
  const [detailId, setDetailId]       = useState<string | null>(null);
  const [editingDebt, setEditingDebt] = useState<DebtSummary | null>(null);
  const [statusSavingId, setStatusSavingId] = useState<string | null>(null);

  // Wizard state
  const [step, setStep]                     = useState<1 | 2 | 3 | 4 | 5>(1);
  const [wName, setWName]                   = useState("");
  const [wIcon, setWIcon]                   = useState("💳");
  const [wType, setWType]                   = useState<DebtType>("credit_card");
  const [wOriginal, setWOriginal]           = useState("");
  const [wCurrent, setWCurrent]             = useState("");
  const [wSameAsOriginal, setWSameAsOriginal] = useState(true);
  const [wApr, setWApr]                     = useState("");
  const [wMinPayment, setWMinPayment]       = useState("");
  const [wTargetDate, setWTargetDate]       = useState("");
  const [wSaving, setWSaving]               = useState(false);
  const [wError, setWError]                 = useState("");
  const [showMiniDebtWizard, setShowMiniDebtWizard] = useState(false);

  // Detail / simulator state
  const [extraPayment, setExtraPayment] = useState("");
  const [deleting, setDeleting]         = useState(false);
  const [reordering, setReordering]     = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [pendingDeleteId, setPendingDeleteId]     = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/debts/summary?${ctxParams}`);
      const d = await res.json();
      setDebts(d.debts ?? []);
    } finally {
      setLoading(false);
    }
  }, [ctxParams]);

  useEffect(() => { load(); }, [load]);

  // ─── Derived ───────────────────────────────────────────────────────────────

  const detailDebt = debts.find(d => d.id === detailId) ?? null;
  const activeDebts = debts.filter(d => d.status === "active");
  const paidDebts   = debts.filter(d => d.status === "paid_off");

  // Avalanche order: highest APR first
  const avalancheIds = [...activeDebts]
    .sort((a, b) => b.interest_rate - a.interest_rate)
    .map(d => d.id);
  const isAvalancheOrder = activeDebts.every((d, i) => d.id === avalancheIds[i]);

  // ─── Wizard helpers ────────────────────────────────────────────────────────

  function openCreate() {
    setShowMiniDebtWizard(true);
  }

  useImperativeHandle(ref, () => ({ triggerCreate: openCreate }));

  function openEdit(debt: DebtSummary) {
    setEditingDebt(debt);
    setWName(debt.name); setWIcon(debt.icon); setWType(debt.debt_type);
    setWOriginal(String(debt.original_balance)); setWCurrent(String(debt.current_balance));
    setWSameAsOriginal(debt.original_balance === debt.current_balance);
    setWApr(String(debt.interest_rate)); setWMinPayment(String(debt.minimum_payment));
    setWTargetDate(debt.target_date ?? "");
    setWError(""); setStep(1);
    setView("wizard");
  }

  async function submitWizard() {
    setWSaving(true); setWError("");
    const body = {
      name: wName, icon: wIcon, debt_type: wType,
      original_balance: Number(wOriginal),
      current_balance: wSameAsOriginal ? Number(wOriginal) : Number(wCurrent),
      interest_rate: Number(wApr),
      minimum_payment: Number(wMinPayment || "0"),
      target_date: wTargetDate || null,
      context_type: activeContext.type,
      context_id: activeContext.id,
    };
    try {
      if (editingDebt) {
        await fetch("/api/debts/update", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, debt_id: editingDebt.id }) });
      } else {
        await fetch("/api/debts/create", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      }
      await load();
      setView("list");
    } catch {
      setWError("Something went wrong. Please try again.");
    } finally {
      setWSaving(false);
    }
  }

  function deleteDebt(id: string) {
    setPendingDeleteId(id);
    setShowDeleteConfirm(true);
  }

  /**
   * Mark a debt paid off, or put it back.
   *
   * Only the status changes — the balance is left alone deliberately. The
   * net worth routes already sum `status === "active"` only, so flipping the
   * status is enough to take it out of the totals, and leaving the balance
   * intact is what makes Reopen a real undo rather than a reset.
   */
  async function setDebtStatus(id: string, status: "active" | "paid_off") {
    setStatusSavingId(id);
    await fetch("/api/debts/update", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        debt_id: id,
        status,
        context_type: activeContext.type,
        context_id: activeContext.id,
      }),
    });
    await load();
    setStatusSavingId(null);
    if (status === "paid_off") setView("list");
  }

  async function executeDelete() {
    if (!pendingDeleteId) return;
    setShowDeleteConfirm(false);
    setDeleting(true);
    await fetch("/api/debts/delete", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ debt_id: pendingDeleteId, context_type: activeContext.type, context_id: activeContext.id }) });
    await load();
    setView("list");
    setPendingDeleteId(null);
    setDeleting(false);
  }

  async function moveDebt(debt: DebtSummary, dir: "up" | "down") {
    const sorted = [...activeDebts];
    const idx = sorted.findIndex(d => d.id === debt.id);
    const swapIdx = dir === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;
    setReordering(true);
    const a = sorted[idx], b = sorted[swapIdx];
    await Promise.all([
      fetch("/api/debts/update", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ debt_id: a.id, priority_order: b.priority_order, context_type: activeContext.type, context_id: activeContext.id }) }),
      fetch("/api/debts/update", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ debt_id: b.id, priority_order: a.priority_order, context_type: activeContext.type, context_id: activeContext.id }) }),
    ]);
    await load();
    setReordering(false);
  }

  async function optimizeOrder() {
    setReordering(true);
    await Promise.all(
      avalancheIds.map((id, i) =>
        fetch("/api/debts/update", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ debt_id: id, priority_order: i, context_type: activeContext.type, context_id: activeContext.id }) })
      )
    );
    await load();
    setReordering(false);
  }

  // ─── Wizard steps reference ────────────────────────────────────────────────

  const wizardMinPaymentRef = wApr && wCurrent
    ? (() => {
        const r = Number(wApr) / 100 / 12;
        const balance = wSameAsOriginal ? Number(wOriginal) : Number(wCurrent);
        return balance * r; // minimum to cover interest
      })()
    : null;

  const wizardPayoffPreview = wApr && (wSameAsOriginal ? wOriginal : wCurrent) && wMinPayment
    ? (() => {
        const balance = wSameAsOriginal ? Number(wOriginal) : Number(wCurrent);
        const n = monthsToPayoff(balance, Number(wApr), Number(wMinPayment));
        if (!n) return null;
        const d = new Date(); d.setMonth(d.getMonth() + Math.ceil(n));
        return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
      })()
    : null;

  // ─── Detail simulator ──────────────────────────────────────────────────────

  const extra = Number(extraPayment) || 0;
  const simBase = detailDebt
    ? simulatePayoff(detailDebt.current_balance, detailDebt.interest_rate, detailDebt.minimum_payment)
    : null;
  const simExtra = detailDebt && extra > 0
    ? simulatePayoff(detailDebt.current_balance, detailDebt.interest_rate, detailDebt.minimum_payment + extra)
    : null;

  // ─── Render ────────────────────────────────────────────────────────────────

  if (view === "wizard") {
    const isEdit = !!editingDebt;
    const balance = wSameAsOriginal ? Number(wOriginal) : Number(wCurrent);

    return (
      <>
      <div className="space-y-5">
        {/* Progress dots */}
        <div className="flex items-center justify-center gap-1.5" data-testid="wizard-debt-progress">
          {([1, 2, 3, 4, 5] as const).map(n => (
            <div key={n} className={`rounded-full transition-all ${step === n ? "w-4 h-1.5 bg-white" : step > n ? "w-1.5 h-1.5 bg-white/40" : "w-1.5 h-1.5 bg-[#2e2e38]"}`} />
          ))}
        </div>

        <div className="bg-[#1e1e24] border border-[#2e2e38] rounded-xl p-5 space-y-5">
          <p className="text-sm font-semibold">{isEdit ? "Edit debt" : "Add a debt"}</p>

          {/* Step 1: Name, type, icon */}
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <p className="text-[10px] text-[#7a7870] uppercase tracking-widest mb-2">Debt name</p>
                <input
                  className="w-full bg-[#16161c] border border-[#2e2e38] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-white/30"
                  placeholder="e.g. Chase Sapphire Card"
                  value={wName}
                  onChange={e => setWName(e.target.value)}
                  autoFocus
                />
              </div>
              <div>
                <p className="text-[10px] text-[#7a7870] uppercase tracking-widest mb-2">Type</p>
                <div className="flex flex-wrap gap-2">
                  {DEBT_TYPES.map(([key, meta]) => (
                    <button
                      key={key}
                      onClick={() => { setWType(key); setWIcon(meta.icon); }}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border transition-colors ${wType === key ? "bg-white text-black border-white" : "border-[#2e2e38] text-[#7a7870] hover:text-white hover:border-white/20"}`}
                    >
                      <span>{meta.icon}</span> {meta.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-[10px] text-[#7a7870] uppercase tracking-widest mb-2">Icon</p>
                <div className="flex gap-2 flex-wrap">
                  {DEBT_ICONS.map(e => (
                    <button key={e} onClick={() => setWIcon(e)} className={`text-xl p-1.5 rounded-lg transition-colors ${wIcon === e ? "bg-white/15" : "hover:bg-white/8"}`}>{e}</button>
                  ))}
                </div>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setView("list")} className="flex-1 py-2.5 text-sm text-[#7a7870] border border-[#2e2e38] rounded-xl hover:text-white transition-colors">Cancel</button>
                <button onClick={() => setStep(2)} disabled={wName.length < 2} className="flex-1 py-2.5 text-sm font-semibold bg-white text-black rounded-xl disabled:opacity-30 hover:bg-white/90 transition-colors">Next →</button>
              </div>
            </div>
          )}

          {/* Step 2: Balances */}
          {step === 2 && (
            <div className="space-y-4">
              <div>
                <p className="text-[10px] text-[#7a7870] uppercase tracking-widest mb-2">Original balance</p>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[#55534e] text-sm">$</span>
                  <input
                    type="number" min="0" step="0.01"
                    className="w-full bg-[#16161c] border border-[#2e2e38] rounded-xl pl-7 pr-4 py-2.5 text-sm focus:outline-none focus:border-white/30"
                    placeholder="0.00"
                    value={wOriginal}
                    onChange={e => setWOriginal(e.target.value)}
                    autoFocus
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={wSameAsOriginal} onChange={e => setWSameAsOriginal(e.target.checked)} className="rounded" />
                <span className="text-xs text-[#7a7870]">Current balance is same as original (new debt)</span>
              </label>
              {!wSameAsOriginal && (
                <div>
                  <p className="text-[10px] text-[#7a7870] uppercase tracking-widest mb-2">Current balance</p>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[#55534e] text-sm">$</span>
                    <input
                      type="number" min="0" step="0.01"
                      className="w-full bg-[#16161c] border border-[#2e2e38] rounded-xl pl-7 pr-4 py-2.5 text-sm focus:outline-none focus:border-white/30"
                      placeholder="0.00"
                      value={wCurrent}
                      onChange={e => setWCurrent(e.target.value)}
                    />
                  </div>
                </div>
              )}
              <div className="flex gap-3">
                <button onClick={() => setStep(1)} className="flex-1 py-2.5 text-sm text-[#7a7870] border border-[#2e2e38] rounded-xl hover:text-white transition-colors">← Back</button>
                <button onClick={() => setStep(3)} disabled={!wOriginal || Number(wOriginal) <= 0} className="flex-1 py-2.5 text-sm font-semibold bg-white text-black rounded-xl disabled:opacity-30 hover:bg-white/90 transition-colors">Next →</button>
              </div>
            </div>
          )}

          {/* Step 3: APR + minimum payment */}
          {step === 3 && (
            <div className="space-y-4">
              <div>
                <p className="text-[10px] text-[#7a7870] uppercase tracking-widest mb-2">Annual interest rate (APR)</p>
                <div className="relative">
                  <input
                    type="number" min="0" max="100" step="0.01"
                    className="w-full bg-[#16161c] border border-[#2e2e38] rounded-xl pl-4 pr-8 py-2.5 text-sm focus:outline-none focus:border-white/30"
                    placeholder="e.g. 24.99"
                    value={wApr}
                    onChange={e => setWApr(e.target.value)}
                    autoFocus
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[#55534e] text-sm">%</span>
                </div>
                {wizardMinPaymentRef !== null && (
                  <p className="text-[10px] text-[#55534e] mt-1">Monthly interest: ~${formatMoney(wizardMinPaymentRef)} — your payment must exceed this to reduce the balance</p>
                )}
              </div>
              <div>
                <p className="text-[10px] text-[#7a7870] uppercase tracking-widest mb-2">Minimum monthly payment</p>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[#55534e] text-sm">$</span>
                  <input
                    type="number" min="0" step="0.01"
                    className="w-full bg-[#16161c] border border-[#2e2e38] rounded-xl pl-7 pr-4 py-2.5 text-sm focus:outline-none focus:border-white/30"
                    placeholder="0.00"
                    value={wMinPayment}
                    onChange={e => setWMinPayment(e.target.value)}
                  />
                </div>
                {wizardPayoffPreview && (
                  <p className="text-[10px] text-emerald-500 mt-1">At this payment rate, paid off by ~{wizardPayoffPreview}</p>
                )}
                {wMinPayment && wApr && Number(wMinPayment) <= (balance * Number(wApr) / 100 / 12) && (
                  <p className="text-[10px] text-red-400 mt-1">⚠ Payment doesn't cover monthly interest — balance will grow</p>
                )}
              </div>
              <div className="flex gap-3">
                <button onClick={() => setStep(2)} className="flex-1 py-2.5 text-sm text-[#7a7870] border border-[#2e2e38] rounded-xl hover:text-white transition-colors">← Back</button>
                <button onClick={() => setStep(4)} disabled={!wApr || Number(wApr) < 0} className="flex-1 py-2.5 text-sm font-semibold bg-white text-black rounded-xl disabled:opacity-30 hover:bg-white/90 transition-colors">Next →</button>
              </div>
            </div>
          )}

          {/* Step 4: Target date (optional) */}
          {step === 4 && (
            <div className="space-y-4">
              <div>
                <p className="text-[10px] text-[#7a7870] uppercase tracking-widest mb-1">Target payoff date</p>
                <p className="text-[11px] text-[#55534e] mb-3">Optional — leave blank to use the minimum payment projection.</p>
                <input
                  type="date"
                  className="w-full bg-[#16161c] border border-[#2e2e38] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-white/30"
                  value={wTargetDate}
                  onChange={e => setWTargetDate(e.target.value)}
                />
                {wizardPayoffPreview && !wTargetDate && (
                  <p className="text-[10px] text-[#55534e] mt-1">At minimum payment: paid off by ~{wizardPayoffPreview}</p>
                )}
              </div>
              <div className="flex gap-3">
                <button onClick={() => setStep(3)} className="flex-1 py-2.5 text-sm text-[#7a7870] border border-[#2e2e38] rounded-xl hover:text-white transition-colors">← Back</button>
                <button onClick={() => setStep(5)} className="flex-1 py-2.5 text-sm font-semibold bg-white text-black rounded-xl hover:bg-white/90 transition-colors">
                  {wTargetDate ? "Next →" : "Skip →"}
                </button>
              </div>
            </div>
          )}

          {/* Step 5: Review + create */}
          {step === 5 && (
            <div className="space-y-4">
              <div className="bg-[#16161c] rounded-xl p-4 space-y-2.5">
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-2xl">{wIcon}</span>
                  <div>
                    <p className="text-sm font-semibold">{wName}</p>
                    <p className="text-[11px] text-[#55534e]">{DEBT_TYPE_META[wType].label}</p>
                  </div>
                </div>
                {[
                  ["Balance", `$${formatMoney(wSameAsOriginal ? Number(wOriginal) : Number(wCurrent))}`],
                  ["Original balance", `$${formatMoney(Number(wOriginal))}`],
                  ["APR", `${wApr}%`],
                  ["Min. payment", `$${formatMoney(Number(wMinPayment || "0"))}/mo`],
                  ...(wTargetDate ? [["Target date", formatDate(wTargetDate)]] : []),
                  ...(wizardPayoffPreview ? [["Projected payoff", wizardPayoffPreview]] : []),
                ].map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between text-xs">
                    <span className="text-[#7a7870]">{label}</span>
                    <span className="font-(--font-mono) text-white">{value}</span>
                  </div>
                ))}
              </div>
              {wError && <p className="text-xs text-red-400">{wError}</p>}
              <div className="flex gap-3">
                <button onClick={() => setStep(4)} disabled={wSaving} className="flex-1 py-2.5 text-sm text-[#7a7870] border border-[#2e2e38] rounded-xl hover:text-white transition-colors">← Back</button>
                <button
                  onClick={submitWizard}
                  disabled={wSaving}
                  data-testid="wizard-debt-create-btn"
                  className="flex-1 py-2.5 text-sm font-semibold bg-white text-black rounded-xl disabled:opacity-50 hover:bg-white/90 transition-colors flex items-center justify-center gap-2"
                >
                  {wSaving ? <><RefreshCw size={13} className="animate-spin" /> Saving…</> : isEdit ? "Save changes" : "Add debt"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
      {showMiniDebtWizard && (
        <MiniDebtWizard
          contextType={activeContext.type}
          contextId={activeContext.id}
          onSuccess={() => { setShowMiniDebtWizard(false); load(); }}
          onClose={() => setShowMiniDebtWizard(false)}
        />
      )}
      </>
    );
  }

  // ─── Detail view ───────────────────────────────────────────────────────────

  if (view === "detail" && detailDebt) {
    const d = detailDebt;
    const currentMonthlyInterest = d.monthly_interest;

    return (
      <>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-center gap-3">
          <button onClick={() => { setView("list"); setDetailId(null); setExtraPayment(""); }} className="text-[#55534e] hover:text-white transition-colors">
            <ChevronLeft size={18} />
          </button>
          <div>
            <p className="text-sm font-semibold">{d.icon} {d.name}</p>
            <p className="text-xs text-[#7a7870]">
              <span className="text-white font-(--font-mono)">${formatMoney(d.current_balance)}</span> remaining
              {d.original_balance > 0 && <> &nbsp;·&nbsp; {Math.round(d.percent_paid)}% paid off</>}
            </p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {onAddAssetForDebt && (
              <button
                onClick={() => onAddAssetForDebt(d.id)}
                className="flex items-center gap-1 text-xs text-[#7a7870] hover:text-white transition-colors border border-[#2e2e38] hover:border-white/20 rounded-lg px-2 py-1"
                data-testid="add-asset-for-debt-btn"
              >
                + Asset
              </button>
            )}
            {d.status === "active" && (
              <button
                onClick={() => setDebtStatus(d.id, "paid_off")}
                disabled={statusSavingId === d.id}
                data-testid="mark-paid-off-btn"
                className="flex items-center gap-1 text-xs text-[#7a7870] hover:text-emerald-400 transition-colors border border-[#2e2e38] hover:border-emerald-400/30 rounded-lg px-2 py-1 disabled:opacity-40"
              >
                <CheckCircle2 size={13} />
                {statusSavingId === d.id ? "Saving…" : "Paid off"}
              </button>
            )}
            <button onClick={() => openEdit(d)} className="text-[#7a7870] hover:text-white transition-colors"><Pencil size={14} /></button>
            <button onClick={() => deleteDebt(d.id)} disabled={deleting} className="text-[#7a7870] hover:text-red-400 transition-colors"><Trash2 size={14} /></button>
          </div>
        </div>

        {/* Progress bar */}
        <div className="bg-[#1e1e24] border border-[#2e2e38] rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="text-[#7a7870]">Paid off</span>
            <span className="font-(--font-mono) text-white">${formatMoney(d.amount_paid)} of ${formatMoney(d.original_balance)}</span>
          </div>
          <div className="h-2 bg-[#2e2e38] rounded-full overflow-hidden">
            <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${d.percent_paid}%` }} />
          </div>
          <div className="grid grid-cols-3 gap-2 pt-1">
            <div className="text-center">
              <p className="text-[10px] text-[#55534e] uppercase tracking-widest">APR</p>
              <p className="text-sm font-semibold font-(--font-mono) text-white mt-1">{d.interest_rate}%</p>
            </div>
            <div className="text-center">
              <p className="text-[10px] text-[#55534e] uppercase tracking-widest">Monthly interest</p>
              <p className="text-sm font-semibold font-(--font-mono) text-red-400 mt-1">${formatMoney(currentMonthlyInterest)}</p>
            </div>
            <div className="text-center">
              <p className="text-[10px] text-[#55534e] uppercase tracking-widest">Min. payment</p>
              <p className="text-sm font-semibold font-(--font-mono) text-white mt-1">${formatMoney(d.minimum_payment)}/mo</p>
            </div>
          </div>
        </div>

        {/* Payoff timeline at minimum payment */}
        <div className="bg-[#1e1e24] border border-[#2e2e38] rounded-xl p-4 space-y-3" data-testid="debt-payoff-section">
          <p className="text-[10px] text-[#7a7870] uppercase tracking-widest">At minimum payment</p>
          {simBase?.months !== null && simBase ? (
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-[#16161c] rounded-xl p-3 space-y-1">
                <p className="text-[10px] text-[#55534e] uppercase tracking-widest">Paid off in</p>
                <p className="text-xl font-semibold font-(--font-mono) text-white leading-tight">{formatMonths(simBase.months)}</p>
                <p className="text-[10px] text-[#7a7870]">{simBase.payoffDate ? formatDate(simBase.payoffDate) : ""}</p>
              </div>
              <div className="bg-red-500/10 rounded-xl p-3 space-y-1">
                <p className="text-[10px] text-[#55534e] uppercase tracking-widest">Total interest</p>
                <p className="text-xl font-semibold font-(--font-mono) text-red-400 leading-tight">${formatMoney(simBase.totalInterest!)}</p>
                <p className="text-[10px] text-red-500">cost of carrying this debt</p>
              </div>
            </div>
          ) : (
            <p className="text-xs text-red-400">⚠ Minimum payment doesn't cover interest — balance will grow indefinitely.</p>
          )}
        </div>

        {/* Extra payment simulator */}
        <div className="bg-[#1e1e24] border border-[#2e2e38] rounded-xl p-4 space-y-4" data-testid="debt-simulator">
          <p className="text-[10px] text-[#7a7870] uppercase tracking-widest">Extra payment simulator</p>
          <div>
            <p className="text-xs text-[#55534e] mb-2">What if you paid extra each month?</p>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[#55534e] text-sm">+$</span>
              <input
                type="number" min="0" step="10"
                className="w-full bg-[#16161c] border border-[#2e2e38] rounded-xl pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:border-white/30"
                placeholder="extra per month"
                value={extraPayment}
                onChange={e => setExtraPayment(e.target.value)}
                data-testid="extra-payment-input"
              />
            </div>
          </div>

          {simExtra && simBase && simBase.months !== null && simExtra.months !== null && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-[#16161c] rounded-xl p-3 space-y-1">
                  <p className="text-[10px] text-[#55534e] uppercase tracking-widest">New payoff</p>
                  <p className="text-lg font-semibold font-(--font-mono) text-emerald-400 leading-tight">{formatMonths(simExtra.months)}</p>
                  <p className="text-[10px] text-[#7a7870]">{simExtra.payoffDate ? formatDate(simExtra.payoffDate) : ""}</p>
                </div>
                <div className="bg-emerald-500/10 rounded-xl p-3 space-y-1">
                  <p className="text-[10px] text-[#55534e] uppercase tracking-widest">Interest saved</p>
                  <p className="text-lg font-semibold font-(--font-mono) text-emerald-400 leading-tight">${formatMoney(Math.max(0, simBase.totalInterest! - simExtra.totalInterest!))}</p>
                  <p className="text-[10px] text-emerald-600">{Math.round(simBase.months - simExtra.months)} months sooner</p>
                </div>
              </div>
              <div className="px-3 py-2 bg-[#16161c] rounded-lg">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[#55534e]">Total monthly payment</span>
                  <span className="font-(--font-mono) text-white">${formatMoney(d.minimum_payment + Number(extraPayment))}/mo</span>
                </div>
                <div className="flex items-center justify-between text-xs mt-1">
                  <span className="text-[#55534e]">Total interest remaining</span>
                  <span className="font-(--font-mono) text-red-400">${formatMoney(simExtra.totalInterest!)}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      {showMiniDebtWizard && (
        <MiniDebtWizard
          contextType={activeContext.type}
          contextId={activeContext.id}
          onSuccess={() => { setShowMiniDebtWizard(false); load(); }}
          onClose={() => setShowMiniDebtWizard(false)}
        />
      )}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 backdrop-blur-[6px]">
          <div className="bg-(--color-elevated) border border-(--color-border-default) rounded-xl p-6 max-w-sm w-full mx-4 flex flex-col gap-4">
            <div className="flex justify-center">
              <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
                <path d="M20 6L36 34H4L20 6Z" stroke="var(--color-danger)" strokeWidth="2.5" strokeLinejoin="round" />
                <line x1="20" y1="17" x2="20" y2="25" stroke="var(--color-danger)" strokeWidth="2.5" strokeLinecap="round" />
                <circle cx="20" cy="29" r="1.5" fill="var(--color-danger)" />
              </svg>
            </div>
            <p className="text-[18px] font-bold text-(--color-text-primary) text-center">Delete this debt?</p>
            <p className="text-[13px] text-(--color-text-secondary) text-center">
              This cannot be undone. The debt will be permanently removed from your account.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => { setShowDeleteConfirm(false); setPendingDeleteId(null); }}
                className="flex-1 py-2.5 rounded-xl border border-(--color-border-default) text-(--color-text-secondary) hover:text-(--color-text-primary) text-[14px] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={executeDelete}
                className="flex-1 py-2.5 rounded-xl text-[14px] font-semibold"
                style={{ background: "var(--color-danger)", color: "white" }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
      </>
    );
  }

  // ─── List view ─────────────────────────────────────────────────────────────

  return (
    <>
    <div className="space-y-4">
      {!loading && activeDebts.length > 0 && (() => {
        const totalOwed = activeDebts.reduce((s, d) => s + d.current_balance, 0);
        const totalMonthlyPayment = activeDebts.reduce((s, d) => s + d.minimum_payment, 0);
        return (
          <>
            <div className="lg:hidden grid grid-cols-2 gap-2 mb-5">
              <div className="bg-[#1e1e24] border border-[#2e2e38] rounded-xl px-4 py-3">
                <p className="text-[11px] text-[#55534e] mb-0.5">Total Owed</p>
                <p className="text-[18px] font-semibold font-(--font-mono) text-red-400">${formatMoney(totalOwed)}</p>
              </div>
              <div className="bg-[#1e1e24] border border-[#2e2e38] rounded-xl px-4 py-3">
                <p className="text-[11px] text-[#55534e] mb-0.5">Monthly</p>
                <p className="text-[18px] font-semibold font-(--font-mono) text-white">${formatMoney(totalMonthlyPayment)}</p>
              </div>
            </div>
            <div className="hidden lg:grid gap-3 mb-5 grid-cols-2">
              <StatCard label="Total Owed" value={`$${formatMoney(totalOwed)}`} variant="danger" />
              <StatCard label="Monthly Payment" value={`$${formatMoney(totalMonthlyPayment)}`} />
            </div>
          </>
        );
      })()}
      {/* Avalanche warning */}
      {activeDebts.length > 1 && !isAvalancheOrder && (
        <div className="flex items-start gap-3 px-4 py-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-xs text-amber-300" data-testid="avalanche-warning">
          <AlertTriangle size={14} className="shrink-0 mt-0.5 text-amber-400" />
          <div className="flex-1">
            <p className="font-medium">Not optimized for lowest interest</p>
            <p className="text-amber-400/70 mt-0.5">Paying highest-APR debts first minimizes total interest paid.</p>
          </div>
          <button
            onClick={optimizeOrder}
            disabled={reordering}
            className="shrink-0 px-2.5 py-1 bg-amber-500/20 hover:bg-amber-500/30 rounded-lg text-amber-300 font-medium transition-colors"
            data-testid="optimize-order-btn"
          >
            {reordering ? <RefreshCw size={12} className="animate-spin" /> : "Optimize"}
          </button>
        </div>
      )}

      {/* Add button */}
      <div className="flex items-center justify-between">
        <p className="text-[10px] text-[#55534e] uppercase tracking-widest">{activeDebts.length} active {activeDebts.length === 1 ? "debt" : "debts"}</p>
        <button onClick={openCreate} className="flex items-center gap-1 text-xs text-[#7a7870] hover:text-white transition-colors" data-testid="add-debt-btn">
          <Plus size={13} /> Add debt
        </button>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <RefreshCw size={14} className="animate-spin text-[#7a7870]" />
        </div>
      )}

      {/* Empty state */}
      {!loading && debts.length === 0 && (
        <div className="text-center py-16 space-y-4">
          <CreditCard size={32} className="text-[#2e2e38] mx-auto" />
          <div>
            <p className="text-sm font-medium text-white">No debts tracked</p>
            <p className="text-xs text-[#55534e] mt-1">Add a credit card, loan, or any balance you&apos;re paying down.</p>
          </div>
          <button onClick={openCreate} className="px-5 py-2.5 text-sm font-semibold bg-white text-black rounded-xl hover:bg-white/90 transition-colors" data-testid="add-first-debt-btn">
            Add your first debt
          </button>
        </div>
      )}

      {/* Active debt cards */}
      {!loading && activeDebts.map((debt, idx) => (
        <div
          key={debt.id}
          className="bg-[#1e1e24] border border-[#2e2e38] rounded-xl p-4 cursor-pointer hover:border-white/10 transition-colors"
          onClick={() => { setDetailId(debt.id); setView("detail"); }}
          data-testid="debt-card"
        >
          {/* Mobile debt row */}
          <div className="lg:hidden flex items-center gap-3 mb-3">
            <span className="text-[28px] w-10 h-10 flex items-center justify-center shrink-0">{debt.icon}</span>
            <div className="flex-1 min-w-0">
              <p className="text-[15px] font-semibold text-white truncate">{debt.name}</p>
              <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/6 text-[#7a7870]">
                  {DEBT_TYPE_META[debt.debt_type]?.label ?? debt.debt_type}
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-500/15 text-red-400 font-(--font-mono)">
                  {debt.interest_rate}% APR
                </span>
                {idx === 0 && activeDebts.length > 1 && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400">Priority #1</span>
                )}
              </div>
            </div>
            <p className="shrink-0 text-[20px] font-semibold font-(--font-mono) text-white">${formatMoney(debt.current_balance)}</p>
          </div>
          {/* Desktop debt row — unchanged */}
          <div className="hidden lg:flex items-start justify-between mb-3">
            <div className="flex items-center gap-3">
              <span className="text-xl">{debt.icon}</span>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-semibold">{debt.name}</p>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/6 text-[#7a7870]">
                    {DEBT_TYPE_META[debt.debt_type]?.label ?? debt.debt_type}
                  </span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-500/15 text-red-400 font-(--font-mono)">
                    {debt.interest_rate}% APR
                  </span>
                  {idx === 0 && activeDebts.length > 1 && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400">Priority #1</span>
                  )}
                </div>
                <p className="text-xs text-[#7a7870] mt-0.5">
                  <span className="text-white font-(--font-mono)">${formatMoney(debt.current_balance)}</span> remaining
                  {debt.projected_payoff_date && <> · paid off ~{formatDate(debt.projected_payoff_date)}</>}
                </p>
              </div>
            </div>
            {/* Up/down reorder */}
            <div className="hidden lg:flex flex-col gap-0.5 ml-2" onClick={e => e.stopPropagation()}>
              <button disabled={idx === 0 || reordering} onClick={() => moveDebt(debt, "up")} className="p-1 text-[#55534e] hover:text-white disabled:opacity-20 transition-colors"><ArrowUp size={12} /></button>
              <button disabled={idx === activeDebts.length - 1 || reordering} onClick={() => moveDebt(debt, "down")} className="p-1 text-[#55534e] hover:text-white disabled:opacity-20 transition-colors"><ArrowDown size={12} /></button>
            </div>
          </div>

          {/* Progress bar */}
          <div className="space-y-1 mb-3">
            <div className="flex items-center justify-between text-[10px] text-[#55534e]">
              <span>{Math.round(debt.percent_paid)}% paid off</span>
              <span className="font-(--font-mono) text-red-400">${formatMoney(debt.monthly_interest)}/mo interest</span>
            </div>
            <div className="h-1.5 bg-[#2e2e38] rounded-full overflow-hidden">
              <div className="h-full rounded-full bg-emerald-500" style={{ width: `${debt.percent_paid}%` }} />
            </div>
          </div>

          {/* Bottom stats */}
          <div className="flex items-center justify-between text-[10px] text-[#55534e]">
            <span>Min. ${formatMoney(debt.minimum_payment)}/mo</span>
            {debt.total_interest_remaining !== null && (
              <span>~${formatMoney(debt.total_interest_remaining)} total interest at min payment</span>
            )}
          </div>
        </div>
      ))}

      {/* Paid-off debts */}
      {!loading && paidDebts.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] text-[#55534e] uppercase tracking-widest">Paid off 🎉</p>
          {paidDebts.map(debt => (
            <div key={debt.id} className="bg-[#1e1e24] border border-[#2e2e38] rounded-xl px-4 py-3 flex items-center justify-between opacity-50">
              <div className="flex items-center gap-2">
                <span>{debt.icon}</span>
                <p className="text-sm text-[#7a7870] line-through">{debt.name}</p>
              </div>
              <div className="flex items-center gap-3">
                {/* Undo, because marking something paid is one tap and misclicks happen. */}
                <button
                  onClick={() => setDebtStatus(debt.id, "active")}
                  disabled={statusSavingId === debt.id}
                  data-testid="reopen-debt-btn"
                  className="flex items-center gap-1 text-[11px] text-[#55534e] hover:text-white transition-colors disabled:opacity-40"
                >
                  <RotateCcw size={12} />
                  {statusSavingId === debt.id ? "Saving…" : "Reopen"}
                </button>
                <button onClick={() => deleteDebt(debt.id)} className="text-[#55534e] hover:text-red-400 transition-colors"><Trash2 size={13} /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
    {showMiniDebtWizard && (
      <MiniDebtWizard
        contextType={activeContext.type}
        contextId={activeContext.id}
        onSuccess={() => { setShowMiniDebtWizard(false); load(); }}
        onClose={() => setShowMiniDebtWizard(false)}
      />
    )}
    {showDeleteConfirm && (
      <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 backdrop-blur-[6px]">
        <div className="bg-(--color-elevated) border border-(--color-border-default) rounded-xl p-6 max-w-sm w-full mx-4 flex flex-col gap-4">
          <div className="flex justify-center">
            <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
              <path d="M20 6L36 34H4L20 6Z" stroke="var(--color-danger)" strokeWidth="2.5" strokeLinejoin="round" />
              <line x1="20" y1="17" x2="20" y2="25" stroke="var(--color-danger)" strokeWidth="2.5" strokeLinecap="round" />
              <circle cx="20" cy="29" r="1.5" fill="var(--color-danger)" />
            </svg>
          </div>
          <p className="text-[18px] font-bold text-(--color-text-primary) text-center">Delete this debt?</p>
          <p className="text-[13px] text-(--color-text-secondary) text-center">
            This cannot be undone. The debt will be permanently removed from your account.
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => { setShowDeleteConfirm(false); setPendingDeleteId(null); }}
              className="flex-1 py-2.5 rounded-xl border border-(--color-border-default) text-(--color-text-secondary) hover:text-(--color-text-primary) text-[14px] transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={executeDelete}
              className="flex-1 py-2.5 rounded-xl text-[14px] font-semibold"
              style={{ background: "var(--color-danger)", color: "white" }}
            >
              Delete
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
});

export default DebtPanel;
