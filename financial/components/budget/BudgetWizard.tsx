"use client";

import { useEffect, useRef, useState } from "react";
import {
  X, Target, ChevronRight, RefreshCw, Info,
  UtensilsCrossed, Car, Film, ShoppingBag, House, HeartPulse,
  Sparkles, Plane, Zap, Wrench, TrendingUp, Banknote, Building2, CircleDot,
  type LucideIcon,
} from "lucide-react";
import { formatMoney, CATEGORY_META } from "@/components/budget/types";
import { ActiveContext } from "@/lib/goals/types";

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface EditingBudget {
  budget_id: string;
  name: string | null;
  category_name: string;
  category_color: string;
  category_icon: string;
  total_limit: number;
  period_type: string;
  goal_id: string | null;
}

export interface WizardSnapshot {
  name: string;
  categoryId: string | null;
  goalId: string | null;
  periodType: "daily" | "weekly" | "monthly" | "quarterly";
  limit: string;
  rollover: boolean;
}

interface GoalOption {
  id: string;
  name: string;
  icon: string;
  percent_complete: number;
}

interface Props {
  editingBudget?: EditingBudget | null;
  activeContext: ActiveContext;
  initialStep?: 1 | 2 | 3 | 4;
  initialName?: string;
  initialCategoryId?: string | null;
  initialGoalId?: string | null;
  initialPeriodType?: "daily" | "weekly" | "monthly" | "quarterly";
  initialLimit?: string;
  initialRollover?: boolean;
  onClose: () => void;
  onCreated: () => void;
  onOpenGoalWizard: (snapshot: WizardSnapshot) => void;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

const BUDGET_CATEGORIES = Object.entries(CATEGORY_META)
  .filter(([key]) => !["TRANSFER_IN", "TRANSFER_OUT", "OTHER"].includes(key))
  .map(([key, m]) => ({ id: key, name: m.label, color: m.hex, icon: m.icon }));

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  UtensilsCrossed, Car, Film, ShoppingBag, House, HeartPulse,
  Sparkles, Plane, Zap, Wrench, TrendingUp, Banknote, Building2, CircleDot,
};

function getCategoryIcon(name: string): LucideIcon {
  return CATEGORY_ICONS[name] ?? CircleDot;
}

// Copied verbatim from BudgetClient.tsx — period calculation must be identical.
function computePeriodBounds(periodType: "daily" | "weekly" | "monthly" | "quarterly"): { period_start: string; period_end: string } {
  const now = new Date();
  const toISO = (d: Date) => d.toISOString().split("T")[0];
  switch (periodType) {
    case "daily":
      return { period_start: toISO(now), period_end: toISO(now) };
    case "weekly": {
      // Sun–Sat weeks: back up to the most recent Sunday, end on Saturday.
      const dow = now.getDay(); // 0 = Sunday
      const sunday = new Date(now); sunday.setDate(now.getDate() - dow);
      const saturday = new Date(sunday); saturday.setDate(sunday.getDate() + 6);
      return { period_start: toISO(sunday), period_end: toISO(saturday) };
    }
    case "quarterly": {
      const q = Math.floor(now.getMonth() / 3);
      const start = new Date(now.getFullYear(), q * 3, 1);
      const end   = new Date(now.getFullYear(), q * 3 + 3, 0);
      return { period_start: toISO(start), period_end: toISO(end) };
    }
    case "monthly":
    default: {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end   = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      return { period_start: toISO(start), period_end: toISO(end) };
    }
  }
}

function CheckMark() {
  return (
    <svg width="8" height="6" viewBox="0 0 8 6" fill="none">
      <path d="M1 3L3 5L7 1" stroke="black" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ─── BudgetWizard ───────────────────────────────────────────────────────────────

export default function BudgetWizard({
  editingBudget, activeContext,
  initialStep, initialName, initialCategoryId, initialGoalId,
  initialPeriodType, initialLimit, initialRollover,
  onClose, onCreated, onOpenGoalWizard,
}: Props) {
  // Animation state — exact copy of GoalWizard pattern
  const [step, setStep] = useState<1 | 2 | 3 | 4>(initialStep ?? 1);
  const [direction, setDirection] = useState<"forward" | "back">("forward");
  const [phase, setPhase] = useState<"idle" | "exiting" | "entering">("idle");
  const nextStepRef = useRef<number>(1);

  // Step 1
  const [budgetName, setBudgetName] = useState(initialName ?? editingBudget?.name ?? "");
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(initialCategoryId ?? null);

  // Step 2
  const [goals, setGoals] = useState<GoalOption[]>([]);
  const [goalsLoading, setGoalsLoading] = useState(true);
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(initialGoalId ?? editingBudget?.goal_id ?? null);

  // Step 3
  const [selectedPeriodType, setSelectedPeriodType] = useState<"daily" | "weekly" | "monthly" | "quarterly">(
    initialPeriodType ?? (editingBudget?.period_type as "daily" | "weekly" | "monthly" | "quarterly") ?? "monthly"
  );
  const [totalLimit, setTotalLimit] = useState(initialLimit ?? (editingBudget ? String(editingBudget.total_limit) : ""));
  const [rollover, setRollover] = useState(initialRollover ?? false);
  const [rolloverTooltipOpen, setRolloverTooltipOpen] = useState(false);
  const [suggestion, setSuggestion] = useState<number | null>(null);

  // Step 4
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Discard overlay
  const [showDiscard, setShowDiscard] = useState(false);

  useEffect(() => {
    fetch("/api/goals/summary")
      .then(r => r.ok ? r.json() : { goals: [] })
      .then(d => {
        setGoals((d.goals ?? []).map((g: { id: string; name: string; icon: string; percent_complete: number }) => ({
          id: g.id, name: g.name, icon: g.icon, percent_complete: g.percent_complete,
        })));
        setGoalsLoading(false);
      })
      .catch(() => setGoalsLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedCategoryId || editingBudget) { setSuggestion(null); return; }
    fetch(`/api/budget/suggest?category_id=${selectedCategoryId}`)
      .then(r => r.ok ? r.json() : { average: null })
      .then(d => setSuggestion(d.average ?? null));
  }, [selectedCategoryId, editingBudget]);

  // Escape key closes only on step 1
  useEffect(() => {
    if (step !== 1) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      const isDirty = budgetName.length > 0 || selectedCategoryId !== null;
      if (isDirty && !editingBudget) { setShowDiscard(true); } else { onClose(); }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [step, budgetName, selectedCategoryId, editingBudget, onClose]);

  function advance(targetStep: number, dir: "forward" | "back") {
    if (phase !== "idle") return;
    nextStepRef.current = targetStep;
    setDirection(dir);
    setPhase("exiting");
  }

  function handleAnimEnd(e: React.AnimationEvent<HTMLDivElement>) {
    if (e.target !== e.currentTarget) return;
    if (phase === "exiting") {
      setStep(nextStepRef.current as 1 | 2 | 3 | 4);
      setPhase("entering");
    } else if (phase === "entering") {
      setPhase("idle");
    }
  }

  function handleClose() {
    const isDirty = budgetName.length > 0 || selectedCategoryId !== null;
    if (isDirty && !editingBudget) { setShowDiscard(true); } else { onClose(); }
  }

  async function save() {
    const limit = parseFloat(totalLimit);
    if (isNaN(limit) || limit <= 0) return;
    setSaving(true);
    setSaveError(null);

    if (editingBudget) {
      const res = await fetch("/api/budget/update", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          budget_id: editingBudget.budget_id,
          name: budgetName.trim() || null,
          total_limit: limit,
          rollover_enabled: rollover,
          period_type: selectedPeriodType,
          ...(selectedGoalId ? { goal_id: selectedGoalId } : {}),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setSaveError((body as { error?: string }).error ?? "Failed to save budget.");
        setSaving(false);
        return;
      }
    } else {
      if (!selectedCategoryId) { setSaving(false); return; }
      const { period_start, period_end } = computePeriodBounds(selectedPeriodType);
      const res = await fetch("/api/budget/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          goal_id: selectedGoalId,
          category_id: selectedCategoryId,
          name: budgetName.trim() || null,
          total_limit: limit,
          rollover_enabled: rollover,
          period_type: selectedPeriodType,
          period_start,
          period_end,
          recurring: true,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setSaveError((body as { error?: string }).error ?? "Failed to create budget.");
        setSaving(false);
        return;
      }
    }

    onCreated();
  }

  const stepClass =
    phase === "exiting"
      ? (direction === "forward" ? "wizard-exit-forward" : "wizard-exit-back")
      : phase === "entering"
        ? (direction === "forward" ? "wizard-enter-forward" : "wizard-enter-back")
        : "";

  const selectedCategory = BUDGET_CATEGORIES.find(c => c.id === selectedCategoryId);
  const selectedGoal = goals.find(g => g.id === selectedGoalId);

  function renderStep() {
    switch (step) {
      case 1:
        return (
          <div className="space-y-5">
            <div>
              <p className="text-[10px] text-[#7a7870] uppercase tracking-widest mb-2">
                Name <span className="normal-case text-[#55534e]">(optional)</span>
              </p>
              <input
                autoFocus
                value={budgetName}
                onChange={e => setBudgetName(e.target.value)}
                placeholder="e.g. Groceries, Date nights, Coffee"
                className="w-full bg-[#0d0d12] border border-[#2e2e38] rounded-lg px-3 py-2.5 text-sm text-white placeholder-[#55534e] focus:outline-none focus:border-white/20"
              />
            </div>
            <div>
              <p className="text-[10px] text-[#7a7870] uppercase tracking-widest mb-2">Category</p>
              {editingBudget ? (() => {
                const EditIcon = getCategoryIcon(editingBudget.category_icon);
                return (
                <div className="flex items-center gap-3 px-4 py-3 bg-[#0d0d12] border border-[#2e2e38] rounded-xl">
                  <div className="w-7 h-7 rounded-full shrink-0 flex items-center justify-center" style={{ background: editingBudget.category_color + "22", color: editingBudget.category_color }}>
                    <EditIcon size={14} />
                  </div>
                  <p className="text-sm text-white font-medium">{editingBudget.category_name}</p>
                  <span className="ml-auto text-[10px] text-[#55534e]">locked</span>
                </div>
                );
              })() : (
                <div className="flex flex-wrap gap-2">
                  {BUDGET_CATEGORIES.map(c => {
                    const PillIcon = getCategoryIcon(c.icon);
                    return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setSelectedCategoryId(c.id)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs border transition-colors ${
                        selectedCategoryId === c.id ? "text-white" : "border-[#2e2e38] text-[#7a7870] hover:text-white"
                      }`}
                      style={selectedCategoryId === c.id ? { borderColor: c.color, background: c.color + "22" } : {}}
                    >
                      <PillIcon size={11} />
                      {c.name}
                    </button>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="flex gap-3 pt-1">
              <button
                onClick={handleClose}
                className="flex-1 py-2.5 text-sm text-[#7a7870] border border-[#2e2e38] rounded-xl hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => advance(2, "forward")}
                disabled={!editingBudget && !selectedCategoryId}
                className="flex-1 py-2.5 text-sm font-semibold bg-white text-black rounded-xl disabled:opacity-30 hover:bg-white/90 transition-colors"
              >
                Next →
              </button>
            </div>
          </div>
        );

      case 2: {
        const openGoalWizard = () => onOpenGoalWizard({
          name: budgetName,
          categoryId: selectedCategoryId,
          goalId: selectedGoalId,
          periodType: selectedPeriodType,
          limit: totalLimit,
          rollover,
        });

        return (
          <div className="space-y-5">
            <div>
              <p className="text-sm font-semibold text-white mb-1">Which savings goal is this for?</p>
              <p className="text-xs text-[#7a7870]">Unspent budget money at period end will be nudged toward this goal.</p>
            </div>

            {goalsLoading ? (
              <div className="flex items-center gap-2 text-[#55534e] text-xs py-4">
                <RefreshCw size={12} className="animate-spin" /> Loading goals…
              </div>
            ) : goals.length === 0 ? (
              <div className="flex flex-col items-center py-6 gap-4">
                <Target size={32} className="text-[#55534e]" />
                <p className="text-sm text-[#7a7870]">You don&apos;t have any savings goals yet</p>
                <button
                  type="button"
                  onClick={openGoalWizard}
                  className="px-4 py-2 text-sm font-medium bg-white text-black rounded-xl hover:bg-white/90 transition-colors"
                >
                  + Create a savings goal
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                {goals.map(g => (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => setSelectedGoalId(prev => prev === g.id ? null : g.id)}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-colors ${
                      selectedGoalId === g.id ? "border-white/40 bg-white/6" : "border-[#2e2e38] hover:border-white/20"
                    }`}
                  >
                    <span className="text-base shrink-0">{g.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white">{g.name}</p>
                      <div className="h-[2px] bg-[#2e2e38] rounded-full mt-1 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-[#7a7870]"
                          style={{ width: `${Math.min(g.percent_complete, 100)}%` }}
                        />
                      </div>
                    </div>
                    <span className="text-[11px] text-[#55534e] font-mono shrink-0">{Math.round(g.percent_complete)}%</span>
                    {selectedGoalId === g.id && (
                      <div className="w-4 h-4 rounded-full bg-white flex items-center justify-center shrink-0">
                        <CheckMark />
                      </div>
                    )}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={openGoalWizard}
                  className="flex items-center gap-2 px-3 py-2 text-xs text-[#7a7870] hover:text-white transition-colors"
                >
                  + Create new goal
                </button>
              </div>
            )}

            <div className="flex flex-col gap-2">
              <div className="flex gap-3">
                <button
                  onClick={() => advance(1, "back")}
                  className="flex-1 py-2.5 text-sm text-[#7a7870] border border-[#2e2e38] rounded-xl hover:text-white transition-colors"
                >
                  ← Back
                </button>
                <button
                  onClick={() => advance(3, "forward")}
                  disabled={!selectedGoalId}
                  className="flex-1 py-2.5 text-sm font-semibold bg-white text-black rounded-xl disabled:opacity-30 hover:bg-white/90 transition-colors"
                >
                  Next →
                </button>
              </div>
            </div>
          </div>
        );
      }

      case 3:
        return (
          <div className="space-y-5">
            <div>
              <p className="text-sm font-semibold text-white mb-1">Set your limit</p>
            </div>
            <div>
              <p className="text-[10px] text-[#7a7870] uppercase tracking-widest mb-2">Period</p>
              <div className="flex gap-2">
                {(["daily", "weekly", "monthly", "quarterly"] as const).map(pt => (
                  <button
                    key={pt}
                    type="button"
                    onClick={() => setSelectedPeriodType(pt)}
                    className={`flex-1 py-1.5 text-xs rounded-full border transition-colors capitalize ${
                      selectedPeriodType === pt
                        ? "border-white/30 bg-white/10 text-white"
                        : "border-[#2e2e38] text-[#7a7870] hover:text-white"
                    }`}
                  >
                    {pt.charAt(0).toUpperCase() + pt.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-[10px] text-[#7a7870] uppercase tracking-widest mb-2">Limit</p>
              <div className="flex items-center gap-2">
                <span className="text-[#7a7870]">$</span>
                <input
                  value={totalLimit}
                  onChange={e => setTotalLimit(e.target.value)}
                  placeholder="0.00"
                  type="number"
                  min="0"
                  step="0.01"
                  className="flex-1 bg-[#0d0d12] border border-[#2e2e38] rounded-lg px-3 py-2.5 text-sm text-white placeholder-[#55534e] focus:outline-none focus:border-white/20"
                />
              </div>
              {suggestion !== null && !editingBudget && (
                <div className="flex items-center justify-between mt-2 px-3 py-2 bg-[#0d0d12] border border-[#2e2e38] rounded-lg">
                  <span className="text-xs text-[#7a7870]">You averaged <span className="text-white font-mono">${formatMoney(suggestion)}</span>/mo — use this?</span>
                  <button
                    type="button"
                    onClick={() => setTotalLimit(String(suggestion))}
                    className="text-xs text-white hover:text-white/70 font-medium transition-colors ml-3"
                  >
                    Use
                  </button>
                </div>
              )}
            </div>
            <div className="space-y-2">
              <label className="flex items-center gap-3 cursor-pointer">
                <div
                  onClick={() => setRollover(v => !v)}
                  className={`w-9 h-5 rounded-full transition-colors flex items-center px-0.5 ${rollover ? "bg-emerald-500" : "bg-[#2e2e38]"}`}
                >
                  <div className={`w-4 h-4 rounded-full bg-white transition-transform ${rollover ? "translate-x-4" : "translate-x-0"}`} />
                </div>
                <span className="text-sm text-[#c8c5bc]">Rollover unused balance</span>
                <button
                  type="button"
                  onClick={() => setRolloverTooltipOpen(v => !v)}
                  className="text-[#55534e] hover:text-[#7a7870] transition-colors"
                >
                  <Info size={13} />
                </button>
              </label>
              {rolloverTooltipOpen && (
                <p className="text-xs text-[#7a7870] bg-[#0d0d12] border border-[#2e2e38] rounded-lg px-3 py-2">
                  If you don&apos;t spend your full budget this period, the leftover amount is added to next period&apos;s limit.
                </p>
              )}
            </div>
            <div className="flex gap-3 pt-1">
              <button
                onClick={() => advance(2, "back")}
                className="flex-1 py-2.5 text-sm text-[#7a7870] border border-[#2e2e38] rounded-xl hover:text-white transition-colors"
              >
                ← Back
              </button>
              <button
                onClick={() => advance(4, "forward")}
                disabled={!totalLimit || parseFloat(totalLimit) <= 0}
                className="flex-1 py-2.5 text-sm font-semibold bg-white text-black rounded-xl disabled:opacity-30 hover:bg-white/90 transition-colors"
              >
                Review →
              </button>
            </div>
          </div>
        );

      case 4: {
        const displayName = budgetName.trim() || (editingBudget?.category_name ?? selectedCategory?.name ?? "");
        const displayColor = editingBudget ? editingBudget.category_color : (selectedCategory?.color ?? "#888888");
        const displayIconKey = editingBudget ? editingBudget.category_icon : (selectedCategory?.icon ?? "OTHER");
        const ReviewIcon = getCategoryIcon(displayIconKey);
        const periodLabel = selectedPeriodType.charAt(0).toUpperCase() + selectedPeriodType.slice(1);

        return (
          <div className="space-y-5">
            <div>
              <p className="text-sm font-semibold text-white mb-1">Looks good?</p>
              <p className="text-xs text-[#7a7870]">Review your budget before {editingBudget ? "saving" : "creating"} it.</p>
            </div>

            <div className="bg-[#1a1a20] border border-[#2e2e38] rounded-xl divide-y divide-[#2e2e38]">
              <div className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-full shrink-0 flex items-center justify-center" style={{ background: displayColor + "22", color: displayColor }}>
                    <ReviewIcon size={14} />
                  </div>
                  <p className="text-sm font-semibold text-white">{displayName}</p>
                </div>
                <button
                  onClick={() => advance(1, "back")}
                  className="text-[10px] text-[#7a7870] hover:text-white flex items-center gap-0.5"
                >
                  Edit <ChevronRight size={10} />
                </button>
              </div>

              <div className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-2">
                  {selectedGoal ? (
                    <>
                      <span className="text-base">{selectedGoal.icon}</span>
                      <p className="text-sm text-white">{selectedGoal.name}</p>
                    </>
                  ) : (
                    <p className="text-sm text-[#55534e]">No goal linked</p>
                  )}
                </div>
                <button
                  onClick={() => advance(2, "back")}
                  className="text-[10px] text-[#7a7870] hover:text-white flex items-center gap-0.5"
                >
                  Edit <ChevronRight size={10} />
                </button>
              </div>

              <div className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-[10px] text-[#55534e] uppercase tracking-widest mb-0.5">Period</p>
                  <p className="text-sm text-white">{periodLabel}</p>
                </div>
                <button
                  onClick={() => advance(3, "back")}
                  className="text-[10px] text-[#7a7870] hover:text-white flex items-center gap-0.5"
                >
                  Edit <ChevronRight size={10} />
                </button>
              </div>

              <div className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-[10px] text-[#55534e] uppercase tracking-widest mb-0.5">Limit</p>
                  <p className="text-sm font-mono text-white">${formatMoney(parseFloat(totalLimit))}</p>
                </div>
                <button
                  onClick={() => advance(3, "back")}
                  className="text-[10px] text-[#7a7870] hover:text-white flex items-center gap-0.5"
                >
                  Edit <ChevronRight size={10} />
                </button>
              </div>

              <div className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-[10px] text-[#55534e] uppercase tracking-widest mb-0.5">Rollover</p>
                  <p className={`text-sm ${rollover ? "text-emerald-400" : "text-[#7a7870]"}`}>{rollover ? "On" : "Off"}</p>
                </div>
                <button
                  onClick={() => advance(3, "back")}
                  className="text-[10px] text-[#7a7870] hover:text-white flex items-center gap-0.5"
                >
                  Edit <ChevronRight size={10} />
                </button>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => { setSaveError(null); advance(3, "back"); }}
                className="flex-1 py-2.5 text-sm text-[#7a7870] border border-[#2e2e38] rounded-xl hover:text-white transition-colors"
              >
                ← Back
              </button>
              <button
                onClick={save}
                disabled={saving}
                className="flex-1 py-2.5 text-sm font-semibold bg-white text-black rounded-xl disabled:opacity-50 hover:bg-white/90 transition-colors flex items-center justify-center gap-2"
              >
                {saving
                  ? <><RefreshCw size={13} className="animate-spin" /> Saving…</>
                  : editingBudget ? "Save changes" : "Create budget"}
              </button>
            </div>
            {saveError && (
              <p className="text-[12px] text-red-400 text-center mt-1">{saveError}</p>
            )}
          </div>
        );
      }
    }
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/70 backdrop-blur-[8px] z-50" />
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-[#111115] rounded-2xl w-full max-w-[calc(100vw-32px)] md:max-w-lg z-50 max-h-[85vh] overflow-y-auto wizard-pop-in">

        {/* Discard overlay */}
        {showDiscard && (
          <div className="absolute inset-0 bg-[#111115] flex flex-col items-center justify-center z-10 rounded-2xl p-6">
            <p className="text-white font-semibold mb-2">Discard this budget?</p>
            <p className="text-sm text-[#7a7870] mb-6 text-center max-w-xs">
              Your progress won&apos;t be saved.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDiscard(false)}
                className="px-5 py-2 text-sm border border-[#2e2e38] rounded-lg text-[#7a7870] hover:text-white transition-colors"
              >
                Keep editing
              </button>
              <button
                onClick={onClose}
                className="px-5 py-2 text-sm bg-white text-black rounded-lg font-semibold hover:bg-white/90 transition-colors"
              >
                Discard
              </button>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-2">
          <p className="text-base font-semibold text-white">
            {editingBudget ? "Edit budget" : "New budget"}
          </p>
          <button onClick={handleClose} className="text-[#55534e] hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Progress dots — 4 steps */}
        <div className="flex items-center justify-center gap-2 py-4">
          {([1, 2, 3, 4] as const).map(n => (
            <div
              key={n}
              className="rounded-full bg-white transition-all duration-200"
              style={{
                width: n === step ? 8 : 4,
                height: n === step ? 8 : 4,
                opacity: n === step ? 1 : 0.25,
              }}
            />
          ))}
        </div>

        {/* Animated step content */}
        <div
          className={`px-5 pb-8 ${stepClass}`}
          onAnimationEnd={handleAnimEnd}
        >
          {renderStep()}
        </div>
      </div>
    </>
  );
}
