"use client";

import { type MortgageInputs } from "./types";
import { defaultInputs } from "./defaults";

/**
 * Keeps calculator inputs across navigation.
 *
 * Nothing here is saved to the database — that's the saved-scenario feature, and
 * it's a deliberate action with a name attached. This is just the working state,
 * so that leaving the page and coming back doesn't wipe what you were modelling.
 */

const KEY = "mortgageCalculatorInputs";

export function loadInputs(): MortgageInputs {
  const fallback = defaultInputs();
  if (typeof window === "undefined") return fallback;

  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return fallback;

    // Spread over the defaults so a stored object written before a field existed
    // still loads, rather than leaving that field undefined.
    return { ...fallback, ...(JSON.parse(raw) as Partial<MortgageInputs>) };
  } catch {
    return fallback;
  }
}

export function saveInputs(inputs: MortgageInputs): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(inputs));
  } catch {
    // Quota or private mode — losing the draft degrades the page, it doesn't break it.
  }
}

export function clearInputs(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* no-op */
  }
}
