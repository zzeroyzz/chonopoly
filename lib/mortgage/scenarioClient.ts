"use client";

import { type MortgageInputs } from "./types";
import { type ScenarioSummary } from "./scenarioService";
import { type PropertyMatch } from "../property/types";

/**
 * Saving an analysis, from the browser.
 *
 * One place for the request, because two components make it: the modal over a
 * house and the saved-scenario bar on /tools/mortgage. They used to each hold
 * their own fetch, which is how one of them could keep sending an address
 * after the other stopped.
 *
 * There is no address parameter, deliberately. A save either names an existing
 * house by id or attaches no house at all — properties are created in one
 * place, Add, and nowhere else. Re-deriving a house from typed text is what
 * produced two property rows for 1900 Windsor Dr SW.
 */

export interface SaveAnalysisInput {
  label: string;
  inputs: MortgageInputs;
  monthlyPayment: number;
  /** An existing house. Null or omitted saves the analysis unattached. */
  propertyId?: string | null;
  contextType?: string;
  contextId?: string;
}

export interface SaveAnalysisResult {
  scenario: ScenarioSummary;
  matchedOn?: PropertyMatch;
}

export async function saveAnalysis(input: SaveAnalysisInput): Promise<SaveAnalysisResult> {
  const label = input.label.trim();
  if (!label) throw new Error("A name is required");

  const res = await fetch("/api/mortgage/scenarios", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      label,
      inputs: input.inputs,
      monthly_payment: input.monthlyPayment,
      // Omitted entirely when there is no house, which the route reads as
      // "quick math, attach nothing".
      ...(input.propertyId ? { property_id: input.propertyId } : {}),
      context_type: input.contextType ?? "personal",
      ...(input.contextId ? { context_id: input.contextId } : {}),
    }),
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? "Could not save");
  }

  return (await res.json()) as SaveAnalysisResult;
}
