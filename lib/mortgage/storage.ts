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

/**
 * One draft per house, plus one for the standalone calculator.
 *
 * A single global key meant the draft left on one house came back on the next
 * one — a price typed for 1653 Sylvan reappeared under 1900 Windsor, which is
 * exactly the kind of crossed wire this binding work exists to remove.
 *
 * The standalone calculator keeps the bare key, so drafts written before this
 * change still load from where they were written. There is nothing to migrate:
 * a house-bound page never had a draft of its own to lose.
 */
function keyFor(propertyId?: string | null): string {
  return propertyId ? `${KEY}:${propertyId}` : KEY;
}

export function loadInputs(propertyId?: string | null): MortgageInputs {
  const fallback = defaultInputs();
  if (typeof window === "undefined") return fallback;

  try {
    const raw = window.localStorage.getItem(keyFor(propertyId));
    if (!raw) return fallback;

    // Spread over the defaults so a stored object written before a field existed
    // still loads, rather than leaving that field undefined.
    const stored = JSON.parse(raw) as Partial<MortgageInputs> & { dpaAmount?: number };
    return { ...fallback, ...stripProfileFields(migrateDpaAmount(stored)) };
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

/**
 * Income and debts belong to the profile now, not to a browser draft.
 *
 * Drafts written before this change carry the old figures — including the
 * fabricated 9000/600 default. Restoring them would let a stale draft quietly
 * out-vote the profile, and the user would have no way to tell which number
 * produced a verdict. The profile wins, always, so these are dropped on read.
 *
 * They are also dropped on write below, so the draft stops carrying a salary
 * around in localStorage at all.
 */
function stripProfileFields(
  stored: Partial<MortgageInputs>
): Partial<MortgageInputs> {
  const rest = { ...stored };
  delete rest.grossMonthlyIncome;
  delete rest.otherMonthlyDebt;
  return rest;
}

/**
 * Whether a draft is already stored for this house.
 *
 * `loadInputs` cannot answer it: an absent draft and a draft equal to the
 * defaults both come back as the defaults. The bound calculator needs the
 * difference, because it seeds a new analysis from the house only when there is
 * no work in progress to overwrite.
 */
export function hasDraft(propertyId?: string | null): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(keyFor(propertyId)) !== null;
  } catch {
    return false;
  }
}

export function saveInputs(inputs: MortgageInputs, propertyId?: string | null): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(keyFor(propertyId), JSON.stringify(stripProfileFields(inputs)));
  } catch {
    // Quota or private mode — losing the draft degrades the page, it doesn't break it.
  }
}

export function clearInputs(propertyId?: string | null): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(keyFor(propertyId));
  } catch {
    /* no-op */
  }
}
