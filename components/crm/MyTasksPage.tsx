"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { AppShell } from "@/components/shell/AppShell";
import { todayKey } from "@/lib/crm/sort";
import { type Task } from "@/lib/crm/types";
import { useCrmContext, useShellProfile } from "./useCrmContext";

/**
 * Open tasks for whoever is signed in, soonest first.
 *
 * Grouped into overdue, today, and later — three headings rather than a filter,
 * because the answer to "what do I do now" should be the first thing on screen
 * and not something you select.
 */
export function MyTasksPage() {
  const router = useRouter();
  const profile = useShellProfile();
  const { ctx, ctxParams } = useCrmContext();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!ctxParams) return;
    try {
      const res = await fetch(`/api/crm/tasks?${ctxParams}`);
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to load");
      const data = await res.json();
      setError(null);
      setTasks((data.tasks ?? []) as Task[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load your tasks");
    } finally {
      setLoading(false);
    }
  }, [ctxParams]);

  useEffect(() => {
    (async () => {
      await load();
    })();
  }, [load]);

  async function complete(taskId: string) {
    if (!ctx) return;
    setBusy(taskId);
    try {
      const res = await fetch("/api/crm/tasks/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task_id: taskId, context_type: ctx.type, context_id: ctx.id }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to complete");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to complete the task");
    } finally {
      setBusy(null);
    }
  }

  const today = todayKey();
  const groups: { label: string; tone: string; items: Task[] }[] = [
    { label: "Overdue", tone: "text-(--color-danger)", items: tasks.filter((t) => t.due_date < today) },
    { label: "Today", tone: "text-(--color-accent)", items: tasks.filter((t) => t.due_date === today) },
    { label: "Later", tone: "text-(--color-text-tertiary)", items: tasks.filter((t) => t.due_date > today) },
  ];

  return (
    <AppShell
      appName="Park Hawkins Properties"
      userProfile={profile}
      onboardingCompleted={null}
      onProfileClick={() => router.push("/finances?tab=profile")}
      asRoutes
      activeNavId="tasks"
      onNavigate={() => {}}
    >
      <div className="overflow-y-auto flex-1 w-full px-4 py-4 pb-24 lg:px-8 lg:pb-8 max-w-2xl">
        <h1 className="text-[18px] font-semibold text-(--color-text-primary)">My tasks</h1>
        <p className="text-[12px] text-(--color-text-secondary) mt-0.5 mb-4">
          {loading ? "Loading…" : `${tasks.length} open`}
        </p>

        {error && (
          <div className="mb-3 text-[12px] text-(--color-danger) border border-(--color-danger) rounded-[var(--radius-md)] px-3 py-2">
            {error}
          </div>
        )}

        {!loading && tasks.length === 0 && (
          <p className="text-[13px] text-(--color-text-secondary)">Nothing open. Nothing overdue.</p>
        )}

        {groups
          .filter((g) => g.items.length > 0)
          .map((g) => (
            <section key={g.label} className="mb-5">
              <h2 className={`text-[11px] uppercase tracking-wider mb-2 ${g.tone}`}>
                {g.label} · {g.items.length}
              </h2>
              <ul className="grid gap-1.5">
                {g.items.map((t) => (
                  <li
                    key={t.id}
                    data-testid="task-row"
                    className="flex items-center justify-between gap-3 bg-(--color-surface) border border-(--color-border-default) rounded-[var(--radius-md)] px-3 py-2.5"
                  >
                    <button
                      type="button"
                      onClick={() => router.push(`/crm/${t.pipeline_entry_id}`)}
                      className="min-w-0 text-left flex-1"
                    >
                      <p className="text-[13px] text-(--color-text-primary) truncate">{t.title}</p>
                      <p className="text-[11px] text-(--color-text-tertiary)">
                        Due{" "}
                        {new Date(t.due_date + "T00:00:00").toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })}
                        {t.cadence_step ? ` · day ${t.cadence_step}` : ""}
                      </p>
                    </button>
                    <button
                      type="button"
                      disabled={busy === t.id}
                      onClick={() => void complete(t.id)}
                      className="text-[11px] inline-flex items-center gap-1 px-2 py-1 rounded-full border border-(--color-border-default) text-(--color-text-secondary) hover:border-(--color-border-strong) transition-colors disabled:opacity-50 shrink-0"
                    >
                      <Check size={11} /> Done
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
      </div>
    </AppShell>
  );
}
