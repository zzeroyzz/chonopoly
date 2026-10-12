import { type CadenceStep, type Stage } from "./types";

/**
 * Follow-up cadence: 7 days, then 14, then 30.
 *
 * A property entering `contacted` without reaching `qualified` gets chased on
 * this schedule. Most deals close on the fifth or sixth touch — the cadence
 * exists so nothing goes quiet by accident.
 *
 * The database function is the source of truth for actually creating these
 * rows; this module is the same arithmetic, testable without a database and
 * used by the UI to say what happens next.
 */

export const CADENCE_STEPS: CadenceStep[] = [7, 14, 30];

export const FIRST_CADENCE_STEP: CadenceStep = 7;

/** The stage that starts the chase. */
export const CADENCE_TRIGGER_STAGE: Stage = "contacted";

/** Stages that end it — either the lead progressed or it's out of the funnel. */
export const CADENCE_END_STAGES: Stage[] = ["qualified", "offer", "under_contract", "closed", "dead"];

/** The next rung, or null when the chase is finished. */
export function nextCadenceStep(current: CadenceStep | null): CadenceStep | null {
  if (current === null) return FIRST_CADENCE_STEP;
  const i = CADENCE_STEPS.indexOf(current);
  if (i === -1 || i === CADENCE_STEPS.length - 1) return null;
  return CADENCE_STEPS[i + 1];
}

/** Due date for a rung, counted from `from`. Date only — tasks are day-grained. */
export function cadenceDueDate(step: CadenceStep, from: Date = new Date()): string {
  const due = new Date(from.getTime());
  due.setUTCDate(due.getUTCDate() + step);
  return due.toISOString().slice(0, 10);
}

/** Whether entering this stage should start the cadence. */
export function startsCadence(to: Stage): boolean {
  return to === CADENCE_TRIGGER_STAGE;
}

/** Whether entering this stage should stop it. */
export function endsCadence(to: Stage): boolean {
  return CADENCE_END_STAGES.includes(to);
}

/**
 * A lead in an active stage with no open task is a defect — it means nobody is
 * chasing it and nothing will remind anyone. The dashboard surfaces these.
 */
export function isStalled(stage: Stage, openTaskCount: number): boolean {
  return !["closed", "dead"].includes(stage) && openTaskCount === 0;
}
