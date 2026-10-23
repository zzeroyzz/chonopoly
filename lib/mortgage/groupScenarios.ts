import { type ScenarioProperty, type ScenarioSummary } from "./scenarioService";

/**
 * How the saved list on /tools/mortgage is arranged, and when a save is
 * allowed. Lifted out of ScenarioBar so both are tested as functions.
 */

export interface ScenarioGroups {
  houses: { property: ScenarioProperty; rows: ScenarioSummary[] }[];
  /** Saves with no house, listed last under "Unassigned". */
  unassigned: ScenarioSummary[];
}

/** Group scenarios by the house they belong to; unassigned ones come last. */
export function groupByProperty(scenarios: ScenarioSummary[]): ScenarioGroups {
  const houses = new Map<string, { property: ScenarioProperty; rows: ScenarioSummary[] }>();
  const unassigned: ScenarioSummary[] = [];

  for (const s of scenarios) {
    if (!s.property) {
      unassigned.push(s);
      continue;
    }
    const existing = houses.get(s.property.id);
    if (existing) existing.rows.push(s);
    else houses.set(s.property.id, { property: s.property, rows: [s] });
  }

  return { houses: [...houses.values()], unassigned };
}

/** Whitespace is not a name: a blank save would be a row nobody can tell apart. */
export function isSaveableName(label: string): boolean {
  return label.trim().length > 0;
}
