/**
 * The rehab estimate: one line per system, worked from photos or a walkthrough.
 *
 * A per-system checklist rather than a single number, because a single number
 * is unarguable — you cannot tell later whether $52,000 assumed a new roof or
 * a patched one, and you cannot refine it after a visit without starting over.
 * Ten lines you can disagree with beat one you cannot.
 */

export const REHAB_SYSTEMS = [
  "roof",
  "hvac",
  "plumbing",
  "electrical",
  "kitchen",
  "baths",
  "flooring",
  "paint",
  "exterior",
  "other",
] as const;

export type RehabSystem = (typeof REHAB_SYSTEMS)[number];

export const SYSTEM_LABEL: Record<RehabSystem, string> = {
  roof: "Roof",
  hvac: "HVAC",
  plumbing: "Plumbing",
  electrical: "Electrical",
  kitchen: "Kitchen",
  baths: "Baths",
  flooring: "Flooring",
  paint: "Paint",
  exterior: "Exterior",
  other: "Other",
};

/**
 * Good costs nothing, by definition. Keeping it as a condition rather than
 * "leave the cost blank" is what lets the checklist say "I looked at the roof
 * and it is fine" instead of "nobody has looked at the roof yet".
 */
export type RehabCondition = "good" | "repair" | "replace";

export const CONDITION_LABEL: Record<RehabCondition, string> = {
  good: "Good",
  repair: "Repair",
  replace: "Replace",
};

export interface RehabLine {
  system: RehabSystem;
  condition: RehabCondition;
  /** Forced to zero when the condition is good. */
  cost: number;
  note: string;
}

/** Where the estimate came from. Decides which contingency applies. */
export type RehabEstimateSource = "photos" | "visit";

/** What gets stored in the `rehab` analysis's inputs blob. */
export interface RehabEstimate {
  lines: RehabLine[];
  source: RehabEstimateSource;
  /** Free text from the walkthrough, kept alongside the lines. */
  visitNotes: string;
}

export function emptyEstimate(source: RehabEstimateSource = "photos"): RehabEstimate {
  return {
    lines: REHAB_SYSTEMS.map((system) => ({
      system,
      condition: "good",
      cost: 0,
      note: "",
    })),
    source,
    visitNotes: "",
  };
}
