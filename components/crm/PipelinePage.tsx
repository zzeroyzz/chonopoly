"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CalendarClock, Check, ChevronRight, Plus } from "lucide-react";
import { AppShell } from "@/components/shell/AppShell";
import { Skeleton, SkeletonCard, SkeletonList, SkeletonRegion } from "@/components/ui/Skeleton";
import { STAGE_LABEL } from "@/lib/crm/stages";
import { daysInStage } from "@/lib/crm/stages";
import { nextTask, todayKey } from "@/lib/crm/sort";
import { type PipelineRow, type Stage } from "@/lib/crm/types";
import { StageMenu } from "./StageMenu";
import { useCrmContext } from "./useCrmContext";
import { useShellProfile } from "@/components/shell/useShellProfile";

/**
 * The pipeline.
 *
 * One list. There is no kanban board on either screen — a board asks you to
 * pick a column before it shows you anything, and the column you want is almost
 * never the one it opens on. Every active lead is visible with no selection
 * first, sorted so the top of the list is the work: overdue, then due today,
 * then whatever has been sitting longest.
 *
 * Desktop is the same list with more room, not a different layout.
 */

function DueBadge({ row }: { row: PipelineRow }) {
  const task = nextTask(row);
  if (!task) {
    // An active lead with no open task is a defect, not a quiet success. It
    // reads as a state, because it is one — the fix is to add a task.
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-(--color-warning)">
        <AlertCircle size={11} /> No follow-up
      </span>
    );
  }

  const today = todayKey();
  const overdue = task.due_date < today;
  const dueToday = task.due_date === today;

  const label = overdue
    ? `Overdue — ${task.title}`
    : dueToday
      ? `Due today — ${task.title}`
      : `${task.title} ${new Date(task.due_date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;

  return (
    <span
      className={`inline-flex items-center gap-1 text-[11px] ${
        overdue
          ? "text-(--color-danger)"
          : dueToday
            ? "text-(--color-accent)"
            : "text-(--color-text-tertiary)"
      }`}
    >
      <CalendarClock size={11} className="shrink-0" />
      <span className="truncate">{label}</span>
    </span>
  );
}

export function PipelinePage() {
  const router = useRouter();
  const profile = useShellProfile();
  const { ctxParams } = useCrmContext();

  const [rows, setRows] = useState<PipelineRow[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showTerminal, setShowTerminal] = useState(false);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // No setState before the first await — this runs from an effect, and a
  // synchronous set there cascades a render before the fetch has even started.
  const load = useCallback(async () => {
    if (!ctxParams) return;
    try {
      const res = await fetch(`/api/crm/pipeline?${ctxParams}&include_terminal=${showTerminal ? "1" : "0"}`);
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to load");
      const data = await res.json();
      setError(null);
      setRows(data.rows ?? []);
      setCounts(data.counts ?? {});
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load the pipeline");
    } finally {
      setLoading(false);
    }
  }, [ctxParams, showTerminal]);

  useEffect(() => {
    // Wrapped in an IIFE so nothing sets state synchronously in the effect body.
    (async () => {
      await load();
    })();
  }, [load]);

  async function changeStage(entryId: string, to: Stage) {
    if (!ctxParams) return;
    setBusy(entryId);
    try {
      const [type, id] = [
        new URLSearchParams(ctxParams).get("context_type"),
        new URLSearchParams(ctxParams).get("context_id"),
      ];
      const res = await fetch("/api/crm/stage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entry_id: entryId, to_stage: to, context_type: type, context_id: id }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to change stage");
      // Reload rather than patching in place: the stage change may have created
      // or skipped a task, and the sort order depends on that.
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to change stage");
    } finally {
      setBusy(null);
    }
  }

  async function complete(taskId: string) {
    if (!ctxParams) return;
    setBusy(taskId);
    try {
      const params = new URLSearchParams(ctxParams);
      const res = await fetch("/api/crm/tasks/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          task_id: taskId,
          context_type: params.get("context_type"),
          context_id: params.get("context_id"),
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to complete task");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to complete the task");
    } finally {
      setBusy(null);
    }
  }

  const activeTotal = Object.entries(counts)
    .filter(([s]) => s !== "closed" && s !== "dead")
    .reduce((sum, [, n]) => sum + n, 0);

  return (
    <AppShell
      appName="Park Hawkins Capital"
      userProfile={profile}
      onboardingCompleted={null}
      onProfileClick={() => router.push("/settings/account")}
    >
      <div className="overflow-y-auto flex-1 w-full px-4 py-4 pb-24 lg:px-8 lg:pb-8">
        <div className="flex items-baseline justify-between gap-3 mb-4">
          <div>
            <h1 className="text-[18px] font-semibold text-(--color-text-primary)">Pipeline</h1>
            {loading ? (
              <Skeleton className="h-3 w-24 mt-1.5" />
            ) : (
              <p className="text-[12px] text-(--color-text-secondary) mt-0.5">
                {`${activeTotal} active ${activeTotal === 1 ? "lead" : "leads"}`}
              </p>
            )}
          </div>
          <button
            type="button"
            data-testid="open-add-lead"
            onClick={() => router.push("/properties/new")}
            className="inline-flex items-center gap-1 text-[12px] px-2.5 py-1.5 rounded-full border border-(--color-border-default) text-(--color-text-secondary) hover:border-(--color-border-strong) transition-colors shrink-0"
          >
            <Plus size={12} />
            Add a house
          </button>
        </div>

        {error && (
          <div className="mb-3 text-[12px] text-(--color-danger) border border-(--color-danger) rounded-[var(--radius-md)] px-3 py-2">
            {error}
          </div>
        )}

        {!loading && rows.length === 0 && (
          <div className="text-[13px] text-(--color-text-secondary) border border-(--color-border-default) rounded-[var(--radius-lg)] px-4 py-8 text-center">
            Nothing in the pipeline yet.
          </div>
        )}

        {loading && (
          <SkeletonRegion label="Loading your pipeline" testId="pipeline-loading">
            <SkeletonList count={4} gap="gap-2">
              {() => (
                <SkeletonCard>
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0 grid gap-1.5">
                      <Skeleton className="h-3.5 w-3/5" />
                      <Skeleton className="h-2.5 w-1/4" />
                    </div>
                    <Skeleton className="h-3.5 w-3.5 shrink-0 rounded-full" />
                  </div>
                  {/* The stage badge and the days-in-stage line below it. */}
                  <div className="flex items-center gap-2 mt-2.5">
                    <Skeleton className="h-6 w-20 rounded-full" />
                    <Skeleton className="h-2.5 w-16" />
                  </div>
                </SkeletonCard>
              )}
            </SkeletonList>
          </SkeletonRegion>
        )}

        {/* Closed and dead are the only thing the list hides, and this is the
            one control that brings them back. */}
        <div className="flex justify-end mb-2">
          <button
            type="button"
            data-testid="toggle-terminal"
            onClick={() => setShowTerminal((v) => !v)}
            className="text-[11px] text-(--color-text-tertiary) hover:text-(--color-text-primary) transition-colors"
          >
            {showTerminal ? "Hide closed & dead" : "Show closed & dead"}
          </button>
        </div>

        <ul className="grid gap-2" data-testid="pipeline-list">
          {rows.map((row) => {
            const task = nextTask(row);
            const days = daysInStage(row.entry.stage_since);
            return (
              <li
                key={row.entry.id}
                data-testid="pipeline-row"
                className="relative bg-(--color-surface) border border-(--color-border-default) rounded-[var(--radius-lg)] px-3.5 py-3"
              >
                <div className="flex items-start gap-3">
                  <button
                    type="button"
                    onClick={() => router.push(`/properties/${row.entry.id}`)}
                    className="flex-1 min-w-0 text-left"
                  >
                    <p className="text-[14px] font-medium text-(--color-text-primary) truncate">
                      {row.addressLine1 || "Address unknown"}
                    </p>
                    {row.city && (
                      <p className="text-[11px] text-(--color-text-tertiary) truncate">{row.city}</p>
                    )}
                    <div className="mt-1.5">
                      <DueBadge row={row} />
                    </div>
                  </button>

                  <ChevronRight size={15} className="text-(--color-text-tertiary) mt-1 shrink-0" />
                </div>

                <div className="flex items-center gap-2 mt-2.5 flex-wrap">
                  <div className="relative">
                    <button
                      type="button"
                      data-testid="stage-badge"
                      disabled={busy === row.entry.id}
                      onClick={() => setMenuFor(menuFor === row.entry.id ? null : row.entry.id)}
                      className="text-[11px] px-2 py-1 rounded-full border border-(--color-border-default) text-(--color-text-secondary) hover:border-(--color-border-strong) transition-colors disabled:opacity-50"
                    >
                      {STAGE_LABEL[row.entry.stage]}
                    </button>
                    {menuFor === row.entry.id && (
                      <StageMenu
                        current={row.entry.stage}
                        onPick={(s) => void changeStage(row.entry.id, s)}
                        onClose={() => setMenuFor(null)}
                      />
                    )}
                  </div>

                  <span className="text-[11px] text-(--color-text-tertiary)">
                    {days === 0 ? "today" : `${days}d in stage`}
                  </span>

                  {task && (
                    <button
                      type="button"
                      data-testid="complete-task"
                      disabled={busy === task.id}
                      onClick={() => void complete(task.id)}
                      className="ml-auto text-[11px] inline-flex items-center gap-1 px-2 py-1 rounded-full border border-(--color-border-default) text-(--color-text-secondary) hover:border-(--color-border-strong) transition-colors disabled:opacity-50"
                    >
                      <Check size={11} /> Done
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </AppShell>
  );
}
