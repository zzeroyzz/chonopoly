/**
 * What Settings → Integrations says about RentCast.
 *
 * Every line here is chosen by the numbers, so it lives as a function and is
 * tested as one. The panel renders what this returns.
 *
 * No key is ever part of this. There is nothing useful to do with a fragment
 * of one, so none is shown, not even masked.
 */

export interface RentCastStatus {
  connected: boolean;
  /** Mock deployments serve fixtures and spend nothing. */
  mode?: "live" | "mock";
  usage: {
    used: number;
    /** The cap, which is what actually stops calls. */
    limit: number;
    planLimit?: number;
    fraction: number;
    monthStart: string;
  };
  cap?: number;
  cacheWindowDays?: number;
  warningFraction: number;
  nearLimit: boolean;
  atLimit: boolean;
}

export interface IntegrationLines {
  connected: "Connected" | "Not connected";
  /** "12 of 50 this month", split so the count can be bold. */
  used: number;
  ofLimit: string;
  left: string;
  /** 0–100, for the bar. */
  percent: number;
  /** The one warning that applies, if any: the wall beats the warning line. */
  warning: { kind: "at_limit" | "near_limit"; text: string } | null;
  /** A counter stuck at zero on a preview should explain itself. */
  mockNote: string | null;
  windowNote: string | null;
  noKeyNote: string | null;
}

export function integrationLines(status: RentCastStatus): IntegrationLines {
  const { usage } = status;
  const remaining = Math.max(0, usage.limit - usage.used);

  const warning: IntegrationLines["warning"] = status.atLimit
    ? {
        kind: "at_limit",
        text: "This month's requests are used up. Comps can still be entered by hand on any property.",
      }
    : status.nearLimit
      ? {
          kind: "near_limit",
          text: `${Math.round(status.warningFraction * 100)}% of this month's requests are used. ${remaining} left — each property you screen spends one.`,
        }
      : null;

  return {
    connected: status.connected ? "Connected" : "Not connected",
    used: usage.used,
    ofLimit: ` of ${usage.limit} this month`,
    left: `${remaining} left`,
    percent: Math.min(100, Math.round(usage.fraction * 100)),
    warning,
    mockNote:
      status.mode === "mock"
        ? "This deployment uses sample comps and never calls RentCast, so the count below stays where it is. Only production spends requests."
        : null,
    windowNote: status.cacheWindowDays
      ? `Each property is looked up at most once every ${status.cacheWindowDays} days, and the app stops at ${usage.limit}${
          usage.planLimit ? ` of the plan's ${usage.planLimit}` : ""
        } so RentCast's own count can never catch us short.`
      : null,
    noKeyNote: status.connected
      ? null
      : "Without a key, comps have to be entered by hand. Every other part of screening works as normal.",
  };
}
