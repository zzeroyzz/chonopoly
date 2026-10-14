"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, X } from "lucide-react";
import { ActiveContext } from "@/lib/goals/types";

interface OnboardingState {
  connected_bank: boolean;
  added_savings_goal: boolean;
  added_debt: boolean;
  added_asset: boolean;
  set_up_budget: boolean;
  dismissed_at: string | null;
}

const STEPS: { key: keyof Omit<OnboardingState, "dismissed_at">; label: string; view: string }[] = [
  { key: "connected_bank",     label: "Connect your bank",        view: "overview" },
  { key: "added_savings_goal", label: "Set a savings goal",       view: "goals" },
  { key: "added_debt",         label: "Tell us what you owe",     view: "debts" },
  { key: "added_asset",        label: "Add what you own",         view: "debts" },
  { key: "set_up_budget",      label: "Create your first budget", view: "budgets" },
];

interface Props {
  activeContext: ActiveContext;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onNavigate: (view: any) => void;
}

export default function OnboardingChecklist({ activeContext, onNavigate }: Props) {
  const [state, setState] = useState<OnboardingState | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [visible, setVisible] = useState(true);

  const load = useCallback(async () => {
    const res = await fetch("/api/onboarding");
    if (!res.ok) return;
    const { onboarding } = await res.json();
    setState(onboarding ?? null);
  }, []);

  // On mount, re-derive flags from live data so the count reflects actual completed steps
  // even if syncSteps wasn't called during the last onboarding session.
  useEffect(() => {
    const ctxParams = `context_type=${activeContext.type}&context_id=${activeContext.id}`;
    Promise.all([
      fetch(`/api/goals/summary?${ctxParams}`).then(r => r.json()).catch(() => ({ goals: [] })),
      fetch(`/api/debts/summary?${ctxParams}`).then(r => r.json()).catch(() => ({ debts: [] })),
      fetch(`/api/assets/summary?${ctxParams}`).then(r => r.json()).catch(() => ({ assets: [] })),
      fetch(`/api/budget/summary?${ctxParams}`).then(r => r.json()).catch(() => ({ summaries: [] })),
      fetch("/api/plaid/transactions").then(r => r.json()).catch(() => ({ accounts: [] })),
    ]).then(([goalsRes, debtsRes, assetsRes, budgetsRes, plaidRes]) => {
      const patch = {
        connected_bank:     (plaidRes.accounts ?? []).length > 0,
        added_savings_goal: (goalsRes.goals ?? []).length > 0,
        added_debt:         (debtsRes.debts ?? []).length > 0,
        added_asset:        (assetsRes.assets ?? []).length > 0,
        set_up_budget:      (budgetsRes.summaries ?? []).length > 0,
      };
      fetch("/api/onboarding", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      }).then(() => load()).catch(() => {});
    }).catch(() => load());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeContext.type, activeContext.id]);

  if (!visible || !state || state.dismissed_at) return null;

  const completedCount = STEPS.filter(s => state[s.key]).length;

  if (completedCount >= 5) return null;

  return (
    <div data-testid="onboarding-checklist" className="pb-2">
      {/* Inline trigger — never pushes content */}
      <div className="border border-emerald-400 rounded-md flex items-center justify-between px-4 py-3 border-pulse">
        <button
          className="flex items-center gap-2 flex-1 text-left hover:opacity-80 transition-opacity"
          onClick={() => setExpanded(true)}
          data-testid="checklist-toggle"
        >
          <span className="text-[10px] text-emerald-400 uppercase tracking-widest">Getting started</span>
          <span className="text-[10px] px-2 py-0.5 rounded-full font-medium border border-emerald-500 text-emerald-500">
            {completedCount} of {STEPS.length}
          </span>
        </button>
        <button
          onClick={() => setVisible(false)}
          className="text-[#55534e] hover:text-white transition-colors shrink-0"
          data-testid="checklist-close"
          aria-label="Dismiss"
        >
          <X size={14} />
        </button>
      </div>

      {/* Modal overlay */}
      {expanded && (
        <div
          className="fixed inset-0 z-80 flex items-center justify-center bg-black/60 backdrop-blur-[6px]"
          onClick={() => setExpanded(false)}
        >
          <div
            className="bg-[#1e1e24] border border-[#2e2e38] rounded-xl p-6 max-w-sm w-full mx-4 flex flex-col gap-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-[#7a7870] uppercase tracking-widest">Getting started</span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${completedCount === STEPS.length ? "bg-emerald-500/20 text-emerald-400" : "bg-white/8 text-[#7a7870]"}`}>
                  {completedCount} of {STEPS.length}
                </span>
              </div>
              <button
                onClick={() => setExpanded(false)}
                className="text-[#55534e] hover:text-white transition-colors"
                aria-label="Close"
              >
                <X size={14} />
              </button>
            </div>

            <div className="space-y-1">
              {STEPS.map(step => {
                const done = state[step.key];
                return (
                  <button
                    key={step.key}
                    onClick={() => { onNavigate(step.view); setExpanded(false); }}
                    className="w-full flex items-center gap-3 text-left hover:bg-white/4 rounded-lg px-2 py-2 transition-colors"
                  >
                    <div className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 ${done ? "bg-emerald-500 border-emerald-500" : "border-[#2e2e38]"}`}>
                      {done && <Check size={11} className="text-black" />}
                    </div>
                    <span className={`text-xs ${done ? "line-through text-[#55534e]" : "text-white"}`}>{step.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
