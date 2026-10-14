"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { formatMoney } from "@/components/budget/types";
import { StatCard } from "@/components/ui/StatCard";
import { ActiveContext, GoalSummary } from "@/lib/goals/types";
import GoalWizard from "@/components/goals/GoalWizard";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

// ─── Row dropdown ─────────────────────────────────────────────────────────────

function ActionsDropdown({ goal, onPause, onDelete, onEdit }: {
  goal: GoalSummary;
  onPause: () => void;
  onDelete: () => void;
  onEdit: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const isPaused = goal.status === "paused";

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={e => { e.stopPropagation(); setOpen(v => !v); }}
        className="p-1 text-(--color-text-tertiary) hover:text-(--color-text-primary) transition-colors opacity-0 group-hover:opacity-100"
      >
        <MoreHorizontal size={15} />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-20 bg-(--color-elevated) border border-(--color-border-default) rounded-md shadow-lg py-1 w-36">
          <button
            onClick={() => { setOpen(false); onEdit(); }}
            className="w-full text-left px-3 py-1.5 text-[13px] text-(--color-text-secondary) hover:text-(--color-text-primary) hover:bg-(--color-border-subtle) transition-colors"
          >
            Edit
          </button>
          <button
            onClick={() => { setOpen(false); onPause(); }}
            className="w-full text-left px-3 py-1.5 text-[13px] text-(--color-text-secondary) hover:text-(--color-text-primary) hover:bg-(--color-border-subtle) transition-colors"
          >
            {isPaused ? "Resume" : "Pause"}
          </button>
          <button
            onClick={() => { setOpen(false); onDelete(); }}
            className="w-full text-left px-3 py-1.5 text-[13px] text-(--color-danger) hover:bg-(--color-danger)/10 transition-colors"
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

// ─── GoalTableView ────────────────────────────────────────────────────────────

interface Props {
  activeContext: ActiveContext;
  onEdit: () => void;
}

export default function GoalTableView({ activeContext, onEdit }: Props) {
  const [goals, setGoals] = useState<GoalSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [wizardOpen, setWizardOpen] = useState(false);

  const ctxParams = `context_type=${activeContext.type}&context_id=${activeContext.id}`;

  const load = useCallback(async () => {
    const res = await fetch(`/api/goals/summary?${ctxParams}`);
    const d = res.ok ? await res.json() : { goals: [] };
    setGoals(d.goals ?? []);
    setLoading(false);
  }, [ctxParams]);

  useEffect(() => { load(); }, [load]);

  async function pauseGoal(goal: GoalSummary) {
    await fetch("/api/goals/update", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        goal_id: goal.id,
        status: goal.status === "paused" ? "active" : "paused",
        context_type: activeContext.type,
        context_id: activeContext.id,
      }),
    });
    load();
  }

  async function deleteGoal(goal: GoalSummary) {
    if (!confirm(`Delete "${goal.name}"?`)) return;
    await fetch("/api/goals/delete", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ goal_id: goal.id, context_type: activeContext.type, context_id: activeContext.id }),
    });
    load();
  }

  if (loading) return (
    <div className="space-y-px">
      {[...Array(4)].map((_, i) => <div key={i} className="h-11 skeleton rounded" />)}
    </div>
  );

  if (goals.length === 0) return (
    <p className="text-sm text-(--color-text-tertiary) py-10 text-center">No savings goals yet.</p>
  );

  const activeGoals = goals.filter(g => g.status !== "achieved");
  const totalSaved = activeGoals.reduce((s, g) => s + g.current_balance, 0);
  const totalTarget = activeGoals.reduce((s, g) => s + (g.target_amount ?? 0), 0);
  const statCols = totalTarget > 0 ? 3 : 2;

  return (
    <>
      <div className={`grid gap-3 mb-5 grid-cols-1 ${{ 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-3' }[statCols] ?? 'sm:grid-cols-2'}`}>
        <StatCard label="Total Saved" value={`$${formatMoney(totalSaved)}`} variant={totalSaved > 0 ? "success" : "muted"} />
        {totalTarget > 0 && <StatCard label="Total Target" value={`$${formatMoney(totalTarget)}`} />}
        <StatCard label="Active Goals" value={String(activeGoals.length)} />
      </div>
      <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr>
            {["Goal", "Target", "Saved", "Progress", "Pace", "Target Date", "Status", ""].map(h => (
              <th key={h} className="text-[10px] uppercase tracking-[0.08em] text-(--color-text-secondary) border-b border-(--color-border-default) sticky top-0 bg-(--color-base) z-10 py-2 px-3 text-left font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {goals.map(g => {
            const isPaused = g.status === "paused";
            const isAchieved = g.status === "achieved";

            return (
              <tr key={g.id} className={`border-b border-(--color-border-subtle) group hover:bg-(--color-border-subtle)/20 transition-colors ${isPaused ? "opacity-50" : ""}`}>
                {/* Goal */}
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[18px] leading-none">{g.icon}</span>
                    <span className="text-[13px] text-(--color-text-primary)">{g.name}</span>
                  </div>
                </td>
                {/* Target */}
                <td className="px-3 py-2" style={{ width: 100 }}>
                  <span className="text-[13px] font-(--font-mono) text-(--color-text-secondary)">
                    {g.target_amount != null ? `$${formatMoney(g.target_amount)}` : "—"}
                  </span>
                </td>
                {/* Saved */}
                <td className="px-3 py-2" style={{ width: 100 }}>
                  <span className="text-[13px] font-(--font-mono) text-(--color-text-primary)">
                    ${formatMoney(g.current_balance)}
                  </span>
                </td>
                {/* Progress */}
                <td className="px-3 py-2" style={{ width: 120 }}>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-[3px] bg-(--color-border-default) rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.min(g.percent_complete, 100)}%`,
                          background: isAchieved ? "var(--color-success)" : "linear-gradient(90deg, var(--color-accent), var(--color-success))",
                        }}
                      />
                    </div>
                    <span className="text-[10px] font-(--font-mono) text-(--color-text-tertiary) shrink-0 w-8 text-right">
                      {Math.round(g.percent_complete)}%
                    </span>
                  </div>
                </td>
                {/* Pace */}
                <td className="px-3 py-2" style={{ width: 120 }}>
                  <span className="text-[13px] font-(--font-mono) text-(--color-text-secondary)">
                    {g.weekly_avg_growth > 0 ? `$${formatMoney(g.weekly_avg_growth)}/wk` : "—"}
                  </span>
                </td>
                {/* Target Date */}
                <td className="px-3 py-2" style={{ width: 100 }}>
                  <span className="text-[13px] font-(--font-mono) text-(--color-text-tertiary)">
                    {g.target_date ? fmtDate(g.target_date) : "None"}
                  </span>
                </td>
                {/* Status */}
                <td className="px-3 py-2" style={{ width: 140 }}>
                  {isAchieved ? (
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-(--color-accent)/15 text-(--color-accent) whitespace-nowrap">Achieved</span>
                  ) : isPaused ? (
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-(--color-border-default) text-(--color-text-tertiary) whitespace-nowrap">Paused</span>
                  ) : g.behind_by > 0 ? (
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-(--color-warning)/15 text-(--color-warning) whitespace-nowrap">Behind ${formatMoney(Math.round(g.behind_by))}</span>
                  ) : (
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-(--color-success)/15 text-(--color-success) whitespace-nowrap">On track</span>
                  )}
                </td>
                {/* Actions */}
                <td className="px-3 py-2" style={{ width: 40 }}>
                  <ActionsDropdown
                    goal={g}
                    onPause={() => pauseGoal(g)}
                    onDelete={() => deleteGoal(g)}
                    onEdit={onEdit}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>

      {wizardOpen && (
        <GoalWizard
          activeContext={activeContext}
          onClose={() => setWizardOpen(false)}
          onCreated={() => { setWizardOpen(false); load(); }}
        />
      )}
    </>
  );
}
