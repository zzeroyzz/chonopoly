"use client";

/**
 * Remembers the last place you were inside each section.
 *
 * Without this, crossing between products costs two taps plus re-navigating:
 * you leave the CRM on a pipeline board, go to the calculator, come back, and
 * land on the CRM's front door instead of the board you were working. That
 * makes the two-tap cost feel like four.
 *
 * localStorage rather than state: it has to survive a full page navigation,
 * which is exactly what crossing sections is.
 */

const KEY = "sectionLastPath";

type Store = Record<string, string>;

function read(): Store {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Store) : {};
  } catch {
    // Private mode, quota, corrupt JSON — a forgotten position is not worth an error.
    return {};
  }
}

export function rememberSectionPath(sectionId: string, path: string): void {
  if (typeof window === "undefined") return;
  try {
    const store = read();
    if (store[sectionId] === path) return;
    store[sectionId] = path;
    window.localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    // Same — losing the memory degrades navigation, it doesn't break it.
  }
}

/** The remembered path for a section, or the section's default. */
export function sectionEntryPath(sectionId: string, fallback: string): string {
  return read()[sectionId] ?? fallback;
}
