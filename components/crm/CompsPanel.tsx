"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Plus, Trash2, AlertTriangle, Lock } from "lucide-react";
import { dollars } from "@/components/mortgage/format";
import { type ActiveContext } from "@/lib/tenancy";
import { type Comp, COMP_STATUS_LABELS } from "@/lib/comps/types";
import { type ArvResult, compEligibility } from "@/lib/comps/arv";
import { CompLinks } from "./CompLinks";

/** "$380k" — the way a price range gets said out loud. */
function dollarsShort(n: number): string {
  return `$${Math.round(n / 1000).toLocaleString("en-US")}k`;
}

/**
 * Comparable sales for one property, and the ARV they produce.
 *
 * Built for 390px first: the comps are cards, not a table. A seven-column table
 * at phone width either scrolls sideways — where the price ends up off screen,
 * which is the one number that matters — or shrinks the text past reading. Each
 * card leads with the include checkbox and the price, because ticking comps and
 * watching the ARV move is the whole job of this tab.
 */

interface CompsResponse {
  comps: Comp[];
  arv: ArvResult;
  degraded?: string | null;
  message?: string | null;
  source?: "live" | "cached" | "rebuilt" | "mock" | null;
  fetchedAt?: string | null;
  nextRefreshAt?: string | null;
  usage?: RefreshUsage | null;
}

interface RefreshUsage {
  used: number;
  cap: number;
  planLimit: number;
  remaining: number;
  atCap: boolean;
}

/** What the tab needs to know before anyone presses anything. */
interface RefreshStatus {
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

/** "Oct 18" — the form the lock message reads best in. */
function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const SOURCE_LABEL: Record<string, string> = {
  cached: "from the saved response",
  rebuilt: "rebuilt from the saved response",
  mock: "sample data — this deployment doesn't call RentCast",
  live: "fresh from RentCast",
};

const CONFIDENCE_LABEL: Record<ArvResult["confidence"], string> = {
  none: "No estimate",
  low: "Low confidence",
  moderate: "Moderate confidence",
  good: "Good confidence",
};

const STATUS_STYLE: Record<string, string> = {
  // Sold is the evidence that counts, so it gets the accent.
  sold: "bg-(--color-accent-glow) text-(--color-accent)",
  removed: "bg-amber-500/10 text-amber-400",
  active: "bg-(--color-elevated) text-(--color-text-secondary)",
};

function perSqft(comp: Comp): string | null {
  if (comp.price === null || comp.sqft === null || comp.sqft <= 0) return null;
  return `$${Math.round(comp.price / comp.sqft)}/sqft`;
}

function monthYear(iso: string): string {
  // Day-level precision is noise here; what matters is how stale the comp is.
  return new Date(iso).toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

/**
 * The date that matters for this comp, and what it means.
 *
 * Which date is relevant depends on the status, so the label says which one is
 * being shown. "Jul 2026" on its own leaves the reader guessing whether the
 * house sold then or merely came to market.
 */
function compDate(comp: Comp): string | null {
  if (comp.status === "sold") {
    return comp.removedDate ? `Sold ${monthYear(comp.removedDate)}` : null;
  }
  if (comp.status === "removed") {
    return comp.removedDate ? `Removed ${monthYear(comp.removedDate)}` : null;
  }
  return comp.listedDate ? `Listed ${monthYear(comp.listedDate)}` : null;
}

/**
 * Read a response safely, whatever came back.
 *
 * A 500 from a crashed route has no JSON body, and calling `.json()` on it
 * throws "Unexpected end of JSON input" — which is what the Comps tab showed
 * instead of the real PostgREST error. Status is checked first, and a body that
 * will not parse becomes a message about the status rather than a parser
 * complaint the user cannot act on.
 */
async function readResponse(res: Response, fallback: string): Promise<CompsResponse> {
  const text = await res.text();

  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      // Left null — handled below.
    }
  }

  if (!res.ok) {
    const message =
      parsed && typeof parsed === "object" && typeof (parsed as { error?: unknown }).error === "string"
        ? (parsed as { error: string }).error
        : `${fallback} (HTTP ${res.status})`;
    throw new Error(message);
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error(`${fallback} — the server sent an empty response.`);
  }

  return parsed as CompsResponse;
}

export function CompsPanel({
  propertyId,
  ctx,
  ctxParams,
}: {
  propertyId: string;
  ctx: ActiveContext | null;
  ctxParams: string | null;
}) {
  const [comps, setComps] = useState<Comp[]>([]);
  const [arv, setArv] = useState<ArvResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [degraded, setDegraded] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [status, setStatus] = useState<RefreshStatus | null>(null);
  const [source, setSource] = useState<string | null>(null);
  const [confirmingForce, setConfirmingForce] = useState(false);

  const apply = useCallback((data: CompsResponse) => {
    setComps(data.comps ?? []);
    setArv(data.arv ?? null);
    setDegraded(data.message ?? null);
    setSource(data.source ?? null);

    // Fold the refresh metadata back into the status so the lock message
    // updates without a second round trip.
    if (data.nextRefreshAt || data.usage) {
      setStatus((current) =>
        current
          ? {
              ...current,
              usage: data.usage ?? current.usage,
              locked: data.nextRefreshAt ? true : current.locked,
              fetchedAt: data.fetchedAt ?? current.fetchedAt,
              nextRefreshAt: data.nextRefreshAt ?? current.nextRefreshAt,
            }
          : current
      );
    }
  }, []);

  const loadStatus = useCallback(async () => {
    if (!ctxParams) return;
    try {
      const res = await fetch(
        `/api/properties/${propertyId}/comps/refresh?${ctxParams}`
      );
      if (!res.ok) return;
      setStatus((await res.json()) as RefreshStatus);
    } catch {
      // The tab works without it; the button just won't know it is locked.
      // Better than refusing to render the comps.
    }
  }, [ctxParams, propertyId]);

  const load = useCallback(async () => {
    if (!ctxParams) return;
    try {
      const res = await fetch(`/api/properties/${propertyId}/comps?${ctxParams}`);
      apply(await readResponse(res, "Failed to load comps"));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load comps");
    } finally {
      setLoading(false);
    }
  }, [ctxParams, propertyId, apply]);

  useEffect(() => {
    // Wrapped rather than called directly: load() sets state, and doing that
    // synchronously in an effect body cascades renders. Same shape as
    // PropertyDetailPage's loader.
    (async () => {
      await load();
      await loadStatus();
    })();
  }, [load, loadStatus]);

  async function refresh(options: { force?: boolean; rebuild?: boolean } = {}) {
    if (!ctx) return;
    setRefreshing(true);
    setError(null);
    try {
      const res = await fetch(`/api/properties/${propertyId}/comps/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          context_type: ctx.type,
          context_id: ctx.id,
          ...(options.force ? { force: true } : {}),
          ...(options.rebuild ? { rebuild: true } : {}),
        }),
      });
      // A degraded lookup is a 200 carrying a reason, not an error — the comps
      // already held stay on screen either way. A real 500 throws with the
      // server's message.
      apply(await readResponse(res, "Failed to refresh comps"));
      await loadStatus();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to refresh comps");
    } finally {
      setRefreshing(false);
    }
  }

  /**
   * A forced refresh spends one of a shared monthly allowance, so it confirms
   * first and says what it costs. "Are you sure?" with no number attached is a
   * prompt people learn to dismiss without reading.
   *
   * Deliberately an in-app panel rather than window.confirm: a native dialog
   * cannot show the cost with any emphasis, looks wrong on a phone, and is
   * rendered by the browser chrome where the rest of this screen is not.
   */
  async function confirmedForceRefresh() {
    setConfirmingForce(false);
    await refresh({ force: true });
  }

  async function toggle(comp: Comp) {
    if (!ctxParams) return;
    // Optimistic: ticking a box should feel instant, and the server's recomputed
    // ARV lands a moment later.
    setComps((current) =>
      current.map((c) => (c.id === comp.id ? { ...c, included: !c.included } : c))
    );
    try {
      const res = await fetch(
        `/api/properties/${propertyId}/comps/${comp.id}?${ctxParams}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ included: !comp.included }),
        }
      );
      apply(await readResponse(res, "Failed to update the comp"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update the comp");
      await load();
    }
  }

  async function remove(comp: Comp) {
    if (!ctxParams) return;
    try {
      const res = await fetch(
        `/api/properties/${propertyId}/comps/${comp.id}?${ctxParams}`,
        { method: "DELETE" }
      );
      apply(await readResponse(res, "Failed to remove the comp"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to remove the comp");
    }
  }

  const includedCount = comps.filter((c) => c.included).length;

  return (
    <div data-testid="panel-comps" className="flex flex-col gap-4">
      {/* ── The ARV ─────────────────────────────────────────────────────── */}
      <div
        data-testid="arv-card"
        className="rounded-xl border border-(--color-border-default) bg-(--color-elevated) p-4"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-widest text-(--color-text-secondary)">
              After-repair value
            </p>
            <p data-testid="arv-value" className="text-2xl font-bold mt-1">
              {arv && arv.value !== null ? dollars(arv.value) : "—"}
            </p>
            {/* Narrowed on `arv` itself first. Reaching through an optional
                chain and comparing to null reads as a guard but isn't one:
                `arv?.valueLow !== null` is true when arv is null, which is
                exactly when the body must not run. */}
            {arv && arv.valueLow !== null && arv.valueHigh !== null && (
              <p className="text-[12px] text-(--color-text-secondary) mt-0.5">
                {dollars(arv.valueLow)} – {dollars(arv.valueHigh)}
              </p>
            )}
          </div>

          {/* A button that cannot do anything is worse than no button. When
              RentCast is unreachable — no key, or the month's allowance gone —
              Refresh is removed entirely and the reason takes its place
              below. Otherwise: locked, or free to call. */}
          {status && !status.connected ? null : status?.usage.atCap ? null : status?.locked ? (
            <button
              type="button"
              onClick={() => setConfirmingForce(true)}
              disabled={refreshing || !ctx || !status.canForce}
              data-testid="force-refresh-comps"
              title={
                status.canForce
                  ? "Spends one request"
                  : "Only the account owner can refresh early"
              }
              className="shrink-0 flex items-center gap-1.5 h-9 px-3 rounded-[var(--radius-pill)] border border-(--color-border-default) text-[12px] font-medium disabled:opacity-50"
            >
              <RefreshCw size={13} className={refreshing ? "animate-spin" : undefined} />
              {refreshing ? "Pulling…" : "Refresh early"}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void refresh()}
              disabled={refreshing || !ctx}
              data-testid="refresh-comps"
              className="shrink-0 flex items-center gap-1.5 h-9 px-3 rounded-[var(--radius-pill)] border border-(--color-border-default) text-[12px] font-medium disabled:opacity-50"
            >
              <RefreshCw size={13} className={refreshing ? "animate-spin" : undefined} />
              {refreshing ? "Pulling…" : "Refresh"}
            </button>
          )}
        </div>

        {/* ── When this house may be looked up again ─────────────────────── */}
        {status?.locked && status.fetchedAt && status.nextRefreshAt && (
          <p
            data-testid="refresh-lock"
            className="flex items-center gap-1.5 text-[11px] text-(--color-text-secondary) mt-2"
          >
            <Lock size={11} className="shrink-0" />
            <span>
              Comps from {shortDate(status.fetchedAt)} · refresh available{" "}
              {shortDate(status.nextRefreshAt)}
            </span>
          </p>
        )}

        {confirmingForce && (
          <div
            data-testid="force-confirm"
            className="mt-3 rounded-lg border border-(--color-border-default) bg-(--color-base) p-3"
          >
            <p className="text-[12px] leading-relaxed">
              Refresh now from RentCast?{" "}
              <span className="font-semibold">
                Uses 1 of {status?.usage.remaining ?? 0} remaining this month.
              </span>
            </p>
            <div className="flex gap-2 mt-3">
              <button
                type="button"
                onClick={() => void confirmedForceRefresh()}
                disabled={refreshing}
                data-testid="force-confirm-yes"
                className="h-9 px-3 rounded-[var(--radius-pill)] bg-(--color-accent) text-(--color-base) text-[12px] font-semibold disabled:opacity-50"
              >
                Use one request
              </button>
              <button
                type="button"
                onClick={() => setConfirmingForce(false)}
                data-testid="force-confirm-no"
                className="h-9 px-3 rounded-[var(--radius-pill)] border border-(--color-border-default) text-[12px] font-medium"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {status && !status.connected && (
          <p
            data-testid="refresh-unavailable"
            className="flex gap-1.5 text-[11px] text-(--color-text-secondary) mt-2 leading-relaxed"
          >
            <AlertTriangle size={12} className="shrink-0 mt-0.5" />
            <span>
              RentCast isn&apos;t connected, so comps can&apos;t be pulled
              automatically. Add them by hand below.
            </span>
          </p>
        )}

        {status?.connected && status.usage.atCap && (
          <p
            data-testid="refresh-cap-notice"
            className="flex gap-1.5 text-[11px] text-red-400 mt-2 leading-relaxed"
          >
            <AlertTriangle size={12} className="shrink-0 mt-0.5" />
            <span>
              {status.usage.used} of {status.usage.cap} monthly RentCast requests used,
              so nothing can be pulled until next month. Comps can still be
              added by hand.
            </span>
          </p>
        )}

        {/* Where these comps came from. A cached or sample set must not be
            mistaken for a fresh lookup. */}
        {source && SOURCE_LABEL[source] && (
          <p data-testid="comps-source" className="text-[11px] text-(--color-text-tertiary) mt-1">
            Comps {SOURCE_LABEL[source]}
          </p>
        )}

        {/* The request is already paid for; rebuilding costs nothing. */}
        {status?.canRebuild && (
          <button
            type="button"
            onClick={() => void refresh({ rebuild: true })}
            disabled={refreshing || !ctx}
            data-testid="rebuild-comps"
            className="self-start text-[11px] text-(--color-accent) font-medium mt-2 disabled:opacity-50"
          >
            Rebuild from saved response
          </button>
        )}

        {/* What the number is built on. Stated, never implied.
            Only shown once there IS a number — with no comps this said "Built
            on no comps" directly above a warning saying "No comps are included
            yet", which is the same sentence twice. The warning is the better
            of the two, because it says what to do. */}
        {/* How the number was reached, in a sentence, then the sanity check
            against what houses there actually fetched. Someone has to be able
            to argue with an ARV, and they cannot argue with a bare figure. */}
        {arv && arv.value !== null && (
          <>
            <p data-testid="arv-plain" className="text-[12px] text-(--color-text-primary) mt-3 leading-relaxed">
              {arv.plainSummary}
            </p>

            <p data-testid="arv-basis" className="text-[11px] text-(--color-text-secondary) mt-1.5 leading-relaxed">
              {`Built on ${arv.basisLabel}`}
              {`, each one's price adjusted by $${arv.adjustmentPerSqft}
                per square foot of size difference from this house's
                ${arv.subjectSqft?.toLocaleString()} sq ft.`}
              {arv.soldOnly
                ? " Only confirmed sales were used — they outrank listings."
                : ""}
            </p>

            {arv.nearbyLow !== null && arv.nearbyHigh !== null && (
              <p data-testid="arv-nearby" className="text-[11px] text-(--color-text-secondary) mt-1">
                Similar homes nearby: {dollarsShort(arv.nearbyLow)}–{dollarsShort(arv.nearbyHigh)}.
              </p>
            )}

            {arv.sanityWarning && (
              <p
                data-testid="arv-sanity"
                className="flex gap-1.5 text-[11px] text-amber-400 mt-2 leading-relaxed"
              >
                <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                <span>{arv.sanityWarning}</span>
              </p>
            )}
          </>
        )}

        {arv && arv.confidence !== "none" && (
          <p className="text-[11px] text-(--color-text-tertiary) mt-1">
            {CONFIDENCE_LABEL[arv.confidence]} · {arv.usedComps.length} comp
            {arv.usedComps.length === 1 ? "" : "s"} used
          </p>
        )}

        {arv?.warnings.map((warning) => (
          <p
            key={warning}
            data-testid="arv-warning"
            className="flex gap-1.5 text-[11px] text-amber-400 mt-2 leading-relaxed"
          >
            <AlertTriangle size={12} className="shrink-0 mt-0.5" />
            <span>{warning}</span>
          </p>
        ))}
      </div>

      {/* RentCast couldn't help — say so, and say what to do instead. */}
      {degraded && (
        <p
          data-testid="comps-degraded"
          className="text-[12px] text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2.5 leading-relaxed"
        >
          {degraded}
        </p>
      )}

      {error && (
        <p
          data-testid="comps-error"
          className="text-[12px] text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2.5"
        >
          {error}
        </p>
      )}

      {/* ── The comps ───────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <h2 className="text-[13px] font-semibold">
          Comps{comps.length > 0 ? ` · ${includedCount} of ${comps.length} included` : ""}
        </h2>
        <button
          type="button"
          onClick={() => setAdding((v) => !v)}
          data-testid="add-comp-toggle"
          className="flex items-center gap-1 text-[12px] text-(--color-accent) font-medium"
        >
          <Plus size={13} />
          Add by hand
        </button>
      </div>

      {adding && (
        <ManualCompForm
          propertyId={propertyId}
          ctx={ctx}
          onAdded={(data) => {
            apply(data);
            setAdding(false);
          }}
          onError={setError}
        />
      )}

      {loading ? (
        <p className="text-[12px] text-(--color-text-secondary)">Loading comps…</p>
      ) : comps.length === 0 ? (
        <p data-testid="comps-empty" className="text-[12px] text-(--color-text-secondary) leading-relaxed">
          No comps yet. Refresh to pull them from RentCast, or add one by hand
          from an agent&apos;s closed-sales list.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {comps.map((comp) => (
            <CompRow key={comp.id} comp={comp} onToggle={toggle} onRemove={remove} />
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * One comp. Hoisted to module scope rather than declared inside CompsPanel —
 * a component defined during render is a new type every pass, which remounts
 * the row and loses the checkbox's focus.
 */
function CompRow({
  comp,
  onToggle,
  onRemove,
}: {
  comp: Comp;
  onToggle: (comp: Comp) => void;
  onRemove: (comp: Comp) => void;
}) {
  const ppsf = perSqft(comp);
  const date = compDate(comp);

  return (
    <li
      data-testid={`comp-${comp.id}`}
      className={`rounded-xl border p-3 transition-opacity ${
        comp.included
          ? "border-(--color-border-default) bg-(--color-elevated)"
          : "border-(--color-border-default) opacity-50"
      }`}
    >
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={comp.included}
          onChange={() => onToggle(comp)}
          aria-label={`Include ${comp.formattedAddress}`}
          data-testid={`comp-include-${comp.id}`}
          className="mt-0.5 size-4 shrink-0 accent-(--color-accent)"
        />

        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium leading-snug wrap-break-word">
            {comp.formattedAddress}
          </p>

          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1.5">
            <span className="text-[14px] font-semibold">
              {comp.price !== null ? dollars(comp.price) : "No price"}
            </span>
            {ppsf && (
              <span className="text-[11px] text-(--color-text-secondary)">{ppsf}</span>
            )}
            <span
              className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded ${
                STATUS_STYLE[comp.status] ?? STATUS_STYLE.active
              }`}
            >
              {COMP_STATUS_LABELS[comp.status]}
            </span>
            {date && (
              <span
                data-testid={`comp-date-${comp.id}`}
                className="text-[11px] text-(--color-text-secondary)"
              >
                {date}
              </span>
            )}
          </div>

          <p className="text-[11px] text-(--color-text-tertiary) mt-1">
            {[
              comp.beds !== null ? `${comp.beds} bd` : null,
              comp.baths !== null ? `${comp.baths} ba` : null,
              comp.sqft !== null ? `${comp.sqft.toLocaleString()} sqft` : null,
              comp.yearBuilt !== null ? `${comp.yearBuilt}` : null,
              comp.distanceMiles !== null ? `${comp.distanceMiles.toFixed(1)} mi` : null,
            ]
              .filter(Boolean)
              .join(" · ") || "No details"}
          </p>

          {comp.notes && (
            <p className="text-[11px] text-(--color-text-secondary) mt-1 italic">{comp.notes}</p>
          )}

          {/* Somewhere to go and check whether this one was renovated. */}
          <div className="mt-1.5">
            <CompLinks comp={comp} />
          </div>
        </div>

        {/* Only hand-entered comps can be deleted. A RentCast comp is untick-ed,
            not removed, so the next refresh does not silently bring it back. */}
        {comp.source === "manual" && (
          <button
            type="button"
            onClick={() => onRemove(comp)}
            aria-label={`Remove ${comp.formattedAddress}`}
            data-testid={`comp-remove-${comp.id}`}
            className="shrink-0 text-(--color-text-tertiary) hover:text-red-400 transition-colors"
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>
    </li>
  );
}

/** Add a closed sale from an agent's list — the evidence RentCast cannot give. */
function ManualCompForm({
  propertyId,
  ctx,
  onAdded,
  onError,
}: {
  propertyId: string;
  ctx: ActiveContext | null;
  onAdded: (data: CompsResponse) => void;
  onError: (message: string) => void;
}) {
  const [address, setAddress] = useState("");
  const [price, setPrice] = useState("");
  const [sqft, setSqft] = useState("");
  const [saleDate, setSaleDate] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ctx) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/properties/${propertyId}/comps`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          context_type: ctx.type,
          context_id: ctx.id,
          formattedAddress: address,
          price: Number(price),
          sqft: sqft ? Number(sqft) : null,
          saleDate: saleDate || null,
          // Typed in by hand means a confirmed sale, which is the entire
          // reason to enter one.
          status: "sold",
        }),
      });
      onAdded(await readResponse(res, "Failed to add the comp"));
      setAddress("");
      setPrice("");
      setSqft("");
      setSaleDate("");
    } catch (e) {
      onError(e instanceof Error ? e.message : "Failed to add the comp");
    } finally {
      setSaving(false);
    }
  }

  const field =
    "w-full bg-(--color-base) border border-(--color-border-default) rounded-lg px-3 py-2.5 text-[13px] focus:outline-none focus:border-(--color-accent) transition-colors";

  return (
    <form
      onSubmit={submit}
      data-testid="manual-comp-form"
      className="flex flex-col gap-2.5 rounded-xl border border-(--color-border-default) p-3"
    >
      <p className="text-[11px] text-(--color-text-secondary) leading-relaxed">
        Saved as a confirmed sale. RentCast can only tell you a listing was
        removed, not that it closed.
      </p>

      <input
        value={address}
        onChange={(e) => setAddress(e.target.value)}
        placeholder="Address"
        required
        data-testid="manual-comp-address"
        className={field}
      />

      <div className="flex gap-2">
        <input
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          placeholder="Sale price"
          inputMode="numeric"
          required
          data-testid="manual-comp-price"
          className={field}
        />
        <input
          value={sqft}
          onChange={(e) => setSqft(e.target.value)}
          placeholder="Sqft"
          inputMode="numeric"
          data-testid="manual-comp-sqft"
          className={field}
        />
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-[11px] text-(--color-text-secondary)">
          Sale date (optional)
        </span>
        <input
          type="date"
          value={saleDate}
          onChange={(e) => setSaleDate(e.target.value)}
          data-testid="manual-comp-date"
          className={field}
        />
      </label>

      <button
        type="submit"
        disabled={saving}
        data-testid="manual-comp-save"
        className="h-10 rounded-[var(--radius-pill)] bg-(--color-accent) text-(--color-base) text-[13px] font-semibold disabled:opacity-50"
      >
        {saving ? "Saving…" : "Add comp"}
      </button>
    </form>
  );
}
