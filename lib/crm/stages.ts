import { type Stage } from "./types";

/**
 * The pipeline stages, in order.
 *
 * `closed` and `dead` are both terminal, and a dead lead can be revived to any
 * earlier stage — that happens often enough that nothing here blocks a backwards
 * move. Sequence is for display and for "how far along is this", not a gate.
 */
export const STAGES: Stage[] = [
  "new_lead",
  "contacted",
  "qualified",
  "offer",
  "under_contract",
  "closed",
  "dead",
];

export const STAGE_LABEL: Record<Stage, string> = {
  new_lead: "New lead",
  contacted: "Contacted",
  qualified: "Qualified",
  offer: "Offer",
  under_contract: "Under contract",
  closed: "Closed",
  dead: "Dead",
};

/** Terminal stages. Filtered out of the pipeline list by default. */
export const TERMINAL_STAGES: Stage[] = ["closed", "dead"];

export function isTerminal(stage: Stage): boolean {
  return TERMINAL_STAGES.includes(stage);
}

/** Stages that count as actively worked — the ones a lead should have tasks in. */
export function isActive(stage: Stage): boolean {
  return !isTerminal(stage);
}

export function stageIndex(stage: Stage): number {
  return STAGES.indexOf(stage);
}

/** Whole days between a stage_since timestamp and now. */
export function daysInStage(stageSince: string, now: Date = new Date()): number {
  const since = new Date(stageSince).getTime();
  if (!Number.isFinite(since)) return 0;
  const ms = now.getTime() - since;
  if (ms < 0) return 0;
  return Math.floor(ms / 86_400_000);
}

/**
 * Whether moving between two stages is a step backwards.
 *
 * Not used to block anything — a stalled deal going back to contacted is normal.
 * It's here so the UI can say so, and so stage history can be read later.
 */
export function isBackwards(from: Stage, to: Stage): boolean {
  if (isTerminal(from) && !isTerminal(to)) return true;
  if (isTerminal(to)) return false;
  return stageIndex(to) < stageIndex(from);
}
