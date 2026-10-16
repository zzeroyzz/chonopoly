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
    const stored = JSON.parse(raw) as Partial<MortgageInputs> & { dpaAmount?: number };
    return { ...fallback, ...migrateDpaAmount(stored) };
  } catch {
    return fallback;
  }
}

/**
 * Assistance used to be a dollar amount the user typed; it is now a yes/no,
 * because the award is a fixed $10,000.
 *
 * Without this, a draft saved with `dpaAmount: 8750` would spread over the
 * defaults, find no `dpaEnabled`, and silently come back with assistance turned
 * off — the figure would simply vanish. Any positive amount means they had the
 * program on, so that is what we restore.
 */
function migrateDpaAmount(
  stored: Partial<MortgageInputs> & { dpaAmount?: number }
): Partial<MortgageInputs> {
  if (stored.dpaAmount === undefined) return stored;

  const { dpaAmount, ...rest } = stored;
  return { ...rest, dpaEnabled: rest.dpaEnabled ?? dpaAmount > 0 };
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
