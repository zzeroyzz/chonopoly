import { type PipelineRow, type Task } from "./types";
import { daysInStage } from "./stages";

/**
 * The pipeline list ordering.
 *
 * There is no board, so this sort is the only thing deciding what the owner
 * sees first. It has to put the work at the top: overdue, then due today, then
 * whatever has been sitting longest.
 */

export type UrgencyBucket = 0 | 1 | 2;

export const BUCKET_OVERDUE: UrgencyBucket = 0;
export const BUCKET_DUE_TODAY: UrgencyBucket = 1;
export const BUCKET_REST: UrgencyBucket = 2;

/** Today as a `YYYY-MM-DD` string, in local time — due dates are day-grained. */
export function todayKey(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** The soonest open task, or null. Rows arrive with open tasks already filtered. */
export function nextTask(row: PipelineRow): Task | null {
  if (row.openTasks.length === 0) return null;
  let soonest = row.openTasks[0];
  for (const t of row.openTasks) {
    if (t.due_date < soonest.due_date) soonest = t;
  }
  return soonest;
}

/**
 * Rows with no open task land in the third bucket rather than the top.
 *
 * They are a defect — an active lead nobody is chasing — but the fix is to
 * create a task, not to shout about it above the things that are actually due.
 * The dashboard's defect list is where that gets surfaced.
 */
export function urgencyBucket(row: PipelineRow, now: Date = new Date()): UrgencyBucket {
  const task = nextTask(row);
  if (task === null) return BUCKET_REST;
  const today = todayKey(now);
  if (task.due_date < today) return BUCKET_OVERDUE;
  if (task.due_date === today) return BUCKET_DUE_TODAY;
  return BUCKET_REST;
}

/**
 * Sorts a copy — the caller's array is left alone, because these rows usually
 * come straight from a query result that other code is also reading.
 */
export function sortPipeline(rows: PipelineRow[], now: Date = new Date()): PipelineRow[] {
  return [...rows].sort((a, b) => {
    const bucketA = urgencyBucket(a, now);
    const bucketB = urgencyBucket(b, now);
    if (bucketA !== bucketB) return bucketA - bucketB;

    // Within overdue, the most overdue first. Within due-today, order by due
    // date is meaningless (they're all today), so both fall through to age.
    if (bucketA === BUCKET_OVERDUE) {
      const dueA = nextTask(a)?.due_date ?? "";
      const dueB = nextTask(b)?.due_date ?? "";
      if (dueA !== dueB) return dueA < dueB ? -1 : 1;
    }

    const ageA = daysInStage(a.entry.stage_since, now);
    const ageB = daysInStage(b.entry.stage_since, now);
    if (ageA !== ageB) return ageB - ageA;

    // Stable tail so the list doesn't reshuffle between renders.
    return a.entry.id < b.entry.id ? -1 : a.entry.id > b.entry.id ? 1 : 0;
  });
}
