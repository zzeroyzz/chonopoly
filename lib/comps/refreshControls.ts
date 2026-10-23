import { shortDate } from "./format";

/**
 * What the Comps tab offers for pulling comps, and what it says about it.
 *
 * Lifted out of CompsPanel so each rule is tested as a function rather than
 * by booting a browser to look for a button. The panel renders what this
 * returns and decides nothing itself.
 */

export interface RefreshUsage {
  used: number;
  cap: number;
  planLimit: number;
  remaining: number;
  atCap: boolean;
}

/** What the tab needs to know before anyone presses anything. */
export interface RefreshStatus {
  usage: RefreshUsage;
  mode: "live" | "mock";
  /** False when no API key is configured — nothing can be pulled at all. */
  connected: boolean;
  locked: boolean;
  fetchedAt: string | null;
  nextRefreshAt: string | null;
  canForce: boolean;
  canRebuild: boolean;
  windowDays: number;
}

export interface RefreshControls {
  /**
   * The one button shown. `none` when it could do nothing: a button that
   * cannot do anything is worse than no button, so the reason stands in its
   * place (`notice`).
   */
  button: "refresh" | "force" | "none";
  /** Refresh early spends a shared allowance, so only the owner may. */
  forceAllowed: boolean;
  /** "Comps from Oct 18 · refresh available Nov 17", when locked. */
  lockLine: string | null;
  /** Why there is no button, when there is none. */
  notice: { kind: "unavailable" | "cap"; text: string } | null;
  /** The request is already paid for; rebuilding costs nothing. */
  rebuild: boolean;
}

/** Where a set of comps came from. A cached or sample set must not read as fresh. */
export const SOURCE_LABEL: Record<string, string> = {
  cached: "from the saved response",
  rebuilt: "rebuilt from the saved response",
  mock: "sample data — this deployment doesn't call RentCast",
  live: "fresh from RentCast",
};

export function sourceLine(source: string | null | undefined): string | null {
  const label = source ? SOURCE_LABEL[source] : undefined;
  return label ? `Comps ${label}` : null;
}

/** "Are you sure?" with no number is a prompt people learn to dismiss unread. */
export function forceCost(remaining: number): string {
  return `Uses 1 of ${remaining} remaining this month.`;
}

export function refreshControls(status: RefreshStatus | null): RefreshControls {
  // Before the status arrives, Refresh shows as it always has: the route
  // enforces every limit, so the worst case is a reason coming back.
  if (!status) {
    return { button: "refresh", forceAllowed: false, lockLine: null, notice: null, rebuild: false };
  }

  const lockLine =
    status.locked && status.fetchedAt && status.nextRefreshAt
      ? `Comps from ${shortDate(status.fetchedAt)} · refresh available ${shortDate(status.nextRefreshAt)}`
      : null;

  const base = { forceAllowed: status.canForce, lockLine, rebuild: status.canRebuild };

  if (!status.connected) {
    return {
      ...base,
      button: "none",
      notice: {
        kind: "unavailable",
        text: "RentCast isn't connected, so comps can't be pulled automatically. Add them by hand below.",
      },
    };
  }

  if (status.usage.atCap) {
    return {
      ...base,
      button: "none",
      notice: {
        kind: "cap",
        text: `${status.usage.used} of ${status.usage.cap} monthly RentCast requests used, so nothing can be pulled until next month. Comps can still be added by hand.`,
      },
    };
  }

  return { ...base, button: status.locked ? "force" : "refresh", notice: null };
}
