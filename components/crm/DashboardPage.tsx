"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle } from "lucide-react";
import { AppShell } from "@/components/shell/AppShell";
import { STAGES, STAGE_LABEL, isTerminal } from "@/lib/crm/stages";
import { nextTask, todayKey } from "@/lib/crm/sort";
import { type PipelineRow, type Stage } from "@/lib/crm/types";
import { useCrmContext, useShellProfile } from "./useCrmContext";

/**
 * Count by stage, tasks due, and the no-open-task defect list. Nothing else.
 *
 * The stage counts live here rather than above the pipeline list, where they'd
 * push the actual work below the fold on a phone. Knowing where the pipeline is
 * bunched is useful; it just isn't the first thing you need.
 */
export function DashboardPage() {
  const router = useRouter();
  const profile = useShellProfile();
  const { ctxParams } = useCrmContext();

  const [rows, setRows] = useState<PipelineRow[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!ctxParams) return;
    try {
      const res = await fetch(`/api/crm/pipeline?${ctxParams}&include_terminal=0`);
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to load");
      const data = await res.json();
      setError(null);
      setRows((data.rows ?? []) as PipelineRow[]);
      setCounts(data.counts ?? {});
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load the dashboard");
    } finally {
      setLoading(false);
    }
  }, [ctxParams]);

  useEffect(() => {
    (async () => {
      await load();
    })();
  }, [load]);

  const today = todayKey();
  const overdue = rows.filter((r) => {
    const t = nextTask(r);
    return t !== null && t.due_date < today;
  });
  const dueToday = rows.filter((r) => {
    const t = nextTask(r);
    return t !== null && t.due_date === today;
  });
  // The defect list: an active lead nobody is chasing. Nothing will remind
  // anyone about these, which is the one failure the cadence exists to prevent.
  const noFollowUp = rows.filter((r) => r.openTasks.length === 0);

  return (
    <AppShell
      appName="Park Hawkins Properties"
      userProfile={profile}
      onboardingCompleted={null}
      onProfileClick={() => router.push("/finances?tab=profile")}
      asRoutes
      activeNavId="dashboard"
      onNavigate={() => {}}
    >
      <div className="overflow-y-auto flex-1 w-full px-4 py-4 pb-24 lg:px-8 lg:pb-8 max-w-2xl">
        <h1 className="text-[18px] font-semibold text-(--color-text-primary) mb-4">Dashboard</h1>

        {error && (
          <div className="mb-3 text-[12px] text-(--color-danger) border border-(--color-danger) rounded-[var(--radius-md)] px-3 py-2">
            {error}
          </div>
        )}

        {loading && <p className="text-[13px] text-(--color-text-secondary)">Loading…</p>}

        <div className="grid grid-cols-2 gap-2 mb-5">
          <div className="bg-(--color-surface) border border-(--color-border-default) rounded-[var(--radius-lg)] px-3.5 py-3">
            <p className="text-[11px] text-(--color-text-tertiary)">Overdue</p>
            <p className="text-[22px] font-semibold text-(--color-danger)">{overdue.length}</p>
          </div>
          <div className="bg-(--color-surface) border border-(--color-border-default) rounded-[var(--radius-lg)] px-3.5 py-3">
            <p className="text-[11px] text-(--color-text-tertiary)">Due today</p>
            <p className="text-[22px] font-semibold text-(--color-text-primary)">{dueToday.length}</p>
          </div>
        </div>

        <h2 className="text-[11px] uppercase tracking-wider text-(--color-text-tertiary) mb-2">
          By stage
        </h2>
        <ul className="grid gap-1 mb-6">
          {STAGES.map((s: Stage) => (
            <li
              key={s}
              className={`flex items-center justify-between text-[13px] px-3 py-2 rounded-[var(--radius-md)] ${
                isTerminal(s) ? "text-(--color-text-tertiary)" : "text-(--color-text-primary)"
              } bg-(--color-surface) border border-(--color-border-default)`}
            >
              <span>{STAGE_LABEL[s]}</span>
              <span className="tabular-nums">{counts[s] ?? 0}</span>
            </li>
          ))}
        </ul>

        <h2 className="text-[11px] uppercase tracking-wider text-(--color-warning) mb-2 flex items-center gap-1.5">
          <AlertCircle size={12} /> No follow-up scheduled
        </h2>
        {noFollowUp.length === 0 ? (
          <p className="text-[12px] text-(--color-text-secondary)">
            Every active lead has something due. Nothing is going quiet.
          </p>
        ) : (
          <ul className="grid gap-1.5">
            {noFollowUp.map((r) => (
              <li key={r.entry.id}>
                <button
                  type="button"
                  data-testid="defect-row"
                  onClick={() => router.push(`/crm/${r.entry.id}`)}
                  className="w-full text-left bg-(--color-surface) border border-(--color-border-default) rounded-[var(--radius-md)] px-3 py-2.5 hover:border-(--color-border-strong) transition-colors"
                >
                  <p className="text-[13px] text-(--color-text-primary) truncate">
                    {r.addressLine1 || "Address unknown"}
                  </p>
                  <p className="text-[11px] text-(--color-text-tertiary)">
                    {STAGE_LABEL[r.entry.stage]}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppShell>
  );
}
