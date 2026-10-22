"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Plus, Trash2, AlertTriangle, Lock } from "lucide-react";
import { dollars } from "@/components/mortgage/format";
import { type ActiveContext } from "@/lib/tenancy";
import {
  type Comp,
  type CompReview,
  COMP_STATUS_LABELS,
  COMP_REVIEW_LABELS,
  compReviewOptions,
  isReviewable,
  isSkipped,
} from "@/lib/comps/types";
import { type ArvResult, type CompNote } from "@/lib/comps/arv";
import {
  comparedToSubject,
  compDate,
  dollarsShort,
  fixerUpperNote,
  monthYear,
  perSqft,
  priceLabel,
  provenanceLabel,
  shortDate,
  type SubjectFacts,
} from "@/lib/comps/format";
import { CompLinks, type CompLinkSource } from "./CompLinks";
import { SalePricePrompt } from "./SalePricePrompt";
import { Dropdown, type DropdownTone } from "@/components/ui/Dropdown";
import {
  CompControls,
  CompReviewTabs,
  FILTER_LABELS,
  defaultTab,
  filterCounts,
  matchesFilter,
  matchesTab,
  sortComps,
  tabCounts,
  type CompFilter,
  type CompSort,
  type ReviewTab,
} from "./CompControls";
import { CompReviewCard, STATUS_STYLE } from "./CompReviewCard";

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
  /** Which specs are missing, when the lookup stopped rather than go out blind. */
  missingFacts?: string[] | null;
  source?: "live" | "cached" | "rebuilt" | "mock" | null;
  /** The subject's own facts, for the per-comp fit reason. Each one the panel
   *  does not have is a check it cannot explain on screen. */
  subjectBeds?: number | null;
  subjectBaths?: number | null;
  subjectPropertyType?: string | null;
  subjectYearBuilt?: number | null;
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

/** Green counts, amber skips, grey undecided — the same at a glance. */
const REVIEW_TONE: Record<CompReview, DropdownTone> = {
  needs_review: "neutral",
  renovated_use: "good",
  not_renovated_skip: "warn",
  took_off_market_skip: "warn",
  not_comparable_skip: "warn",
  cant_tell_skip: "warn",
};

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
  onEditFacts,
}: {
  propertyId: string;
  ctx: ActiveContext | null;
  ctxParams: string | null;
  /** Opens the house facts form, which is the only way past a blocked lookup. */
  onEditFacts: () => void;
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
  const [subjectBeds, setSubjectBeds] = useState<number | null>(null);
  const [subjectBaths, setSubjectBaths] = useState<number | null>(null);
  const [subjectYearBuilt, setSubjectYearBuilt] = useState<number | null>(null);
  const [confirmingForce, setConfirmingForce] = useState(false);
  /** Set when a lookup stopped because the house has no size or bed count. */
  const [blindLookup, setBlindLookup] = useState<{ message: string; facts: string[] } | null>(null);
  const [sort, setSort] = useState<CompSort>("closest");
  const [filter, setFilter] = useState<CompFilter>("all");
  const [tab, setTab] = useState<ReviewTab | null>(null);
  /**
   * Comps pushed to the back of today's queue.
   *
   * "Later" is not a review state — it records nothing and moves nothing. It
   * exists because "I'll come back to this" and "this house doesn't belong"
   * are different things, and the old screen made you say them with the same
   * control.
   */
  const [deferred, setDeferred] = useState<string[]>([]);
  /** How many have been answered since this tab opened, so "3 of 7" counts. */
  const [done, setDone] = useState(0);

  const apply = useCallback((data: CompsResponse) => {
    setComps(data.comps ?? []);
    setArv(data.arv ?? null);
    // A blind-lookup stop gets its own panel with a way past it, so it must not
    // also appear as a plain amber notice with no button attached.
    const stoppedForFacts = data.degraded === "missing_facts";
    setBlindLookup(
      stoppedForFacts ? { message: data.message ?? "", facts: data.missingFacts ?? [] } : null
    );
    setDegraded(stoppedForFacts ? null : (data.message ?? null));
    setSource(data.source ?? null);
    setSubjectBeds(data.subjectBeds ?? null);
    setSubjectBaths(data.subjectBaths ?? null);
    setSubjectYearBuilt(data.subjectYearBuilt ?? null);

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

  /**
   * Remember how this house was last sorted and filtered.
   *
   * Per house, because the right view of a 10-comp house is not the right
   * view of an 80-comp one. sessionStorage rather than localStorage: it is a
   * view preference, and resetting with the browser is fine.
   */
  const viewKey = `comps:view:${propertyId}`;

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(viewKey);
      if (!saved) return;
      const parsed = JSON.parse(saved) as { sort?: CompSort; filter?: CompFilter };
      if (parsed.sort) setSort(parsed.sort);
      if (parsed.filter) setFilter(parsed.filter);
    } catch {
      // A corrupt or unavailable store is not worth failing the tab over.
    }
  }, [viewKey]);

  useEffect(() => {
    try {
      sessionStorage.setItem(viewKey, JSON.stringify({ sort, filter }));
    } catch {
      // Private browsing can refuse writes. The view still works.
    }
  }, [viewKey, sort, filter]);

  async function refresh(
    options: { force?: boolean; rebuild?: boolean } = {}
  ) {
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

  async function review(
    comp: Comp,
    next: CompReview,
    extra?: { sale?: { price: number; date: string | null }; notes?: string | null }
  ) {
    const sale = extra?.sale;
    if (!ctxParams) return;
    // Optimistic: choosing an answer should feel instant, and the server's
    // recomputed ARV lands a moment later.
    setComps((current) =>
      current.map((c) =>
        c.id === comp.id
          ? {
              ...c,
              review: next,
              salePrice: sale?.price ?? null,
              saleDate: sale?.date ?? null,
              reviewNotes: extra?.notes === undefined ? c.reviewNotes : extra.notes,
            }
          : c
      )
    );
    try {
      const res = await fetch(
        `/api/properties/${propertyId}/comps/${comp.id}?${ctxParams}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            review: next,
            ...(sale ? { salePrice: sale.price, saleDate: sale.date } : {}),
            ...(extra?.notes === undefined ? {} : { reviewNotes: extra.notes }),
          }),
        }
      );
      apply(await readResponse(res, "Failed to save your review"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save your review");
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

  // Null until the comps land, then whichever half has work in it.
  const activeTab: ReviewTab = tab ?? defaultTab(comps);
  const activeFilter: CompFilter = filter;

  /**
   * The ARV's verdict on each comp: counted, why not, and any flag.
   *
   * Computed server-side because most of it depends on the whole set — a
   * duplicate is only a duplicate beside its twin, and the fixer test needs
   * the median of the counted comps. A card cannot work that out alone.
   */
  const notes = new Map((arv?.compNotes ?? []).map((n) => [n.compId, n]));

  /** The house being bought, so every comp can say how it differs from it. */
  const subject: SubjectFacts = {
    beds: subjectBeds,
    baths: subjectBaths,
    sqft: arv?.subjectSqft ?? null,
    yearBuilt: subjectYearBuilt,
  };

  const counts = filterCounts(comps, notes);
  const tabs = tabCounts(comps, notes);
  const visible = sortComps(
    comps.filter(
      (c) =>
        matchesTab(c, notes.get(c.id), activeTab) &&
        matchesFilter(c, notes.get(c.id), activeFilter)
    ),
    sort,
    arv?.subjectSqft ?? null
  );

  /**
   * One house at a time, and the deferred ones at the back.
   *
   * Reviewing a comp takes it out of this tab, so the queue shortens as the
   * work is done and the next house arrives on its own.
   */
  /**
   * The comps this screen is actually about.
   *
   * The header counted every comp while the tabs counted only the ones that
   * can be judged, so a house with nine active listings read "0 of 81
   * approved" above "72 Still to check" — two true numbers that look like a
   * bug sitting next to each other.
   */
  const judgeable = comps.filter((c) => isReviewable(c.status)).length;

  const queue = [
    ...visible.filter((c) => !deferred.includes(c.id)),
    ...visible.filter((c) => deferred.includes(c.id)),
  ];
  const current = queue[0];

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
            {/* Not a warning: nothing is wrong, the work has not been done. */}
            {arv?.reviewPrompt && (
              <p data-testid="arv-review-prompt" className="text-[12px] text-(--color-text-secondary) mt-1 leading-relaxed">
                {arv.reviewPrompt}
              </p>
            )}
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

        {/* Stopped before the request was spent, because RentCast matches on
            specs this house does not have yet. Says what is missing, what it
            costs to go ahead anyway, and leaves the choice open. */}
        {blindLookup && (
          <div
            data-testid="missing-facts-warning"
            className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3"
          >
            <p className="flex gap-1.5 text-[12px] text-amber-300 leading-relaxed">
              <AlertTriangle size={13} className="shrink-0 mt-0.5" />
              <span>{blindLookup.message}</span>
            </p>
            {/* No override. Without the size and bed count every sale nearby
                counts as a comparison, so there is nothing useful to do with
                the response — the button goes to the form instead. */}
            <div className="flex flex-wrap gap-2 mt-3">
              <button
                type="button"
                onClick={onEditFacts}
                data-testid="missing-facts-edit"
                className="h-9 px-3 rounded-(--radius-pill) bg-(--color-accent) text-(--color-base) text-[12px] font-semibold"
              >
                Add size and bedrooms
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
              {arv.basisLabel}
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

            {arv.countedTwice.length > 0 && (
              <p data-testid="arv-counted-twice" className="text-[11px] text-(--color-text-secondary) mt-1 leading-relaxed">
                {arv.countedTwice.join(", ")} approved twice, counted once.
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
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5 min-w-0">
          <h2 className="text-[13px] font-semibold">
            Comps{comps.length > 0 ? ` · ${counts.approved} of ${judgeable} approved` : ""}
          </h2>
        </div>
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

      {comps.length > 0 && (
        <CompControls
          sort={sort}
          filter={activeFilter}
          counts={counts}
          shown={visible.length}
          total={comps.length}
          onSortChange={setSort}
          onFilterChange={setFilter}
          showFilter={activeTab === "done"}
        />
      )}

      {comps.length > 0 && (
        <CompReviewTabs
          tab={activeTab}
          counts={tabs}
          onTabChange={(next) => {
            setTab(next);
            setDeferred([]);
            setDone(0);
          }}
        />
      )}

      {loading ? (
        <p className="text-[12px] text-(--color-text-secondary)">Loading comps…</p>
      ) : comps.length === 0 ? (
        <p data-testid="comps-empty" className="text-[12px] text-(--color-text-secondary) leading-relaxed">
          No comps yet. Refresh to pull them from RentCast, or add one by hand
          from an agent&apos;s closed-sales list.
        </p>
      ) : visible.length === 0 && activeTab === "todo" && activeFilter === "all" ? (
        /* Not a problem — the work is finished. It says what that produced,
           because "nothing here" on a valuation screen is a number, not a
           blank. */
        <div data-testid="comps-all-checked" className="flex flex-col items-start gap-2">
          <p className="text-[12px] text-(--color-text-secondary) leading-relaxed">
            All {comps.length} checked.{" "}
            {arv && arv.value !== null
              ? `Your resale price is ${dollars(arv.value)}, built from ${counts.approved} of them.` +
              (arv.unreadable > 0
                ? ` ${arv.unreadable} had no photos left, so ${arv.unreadable === 1 ? "it was" : "they were"} left out.`
                : "")
              : "Nothing is counted yet, so there is no resale price."}
          </p>
          <button
            type="button"
            onClick={() => setTab("done")}
            data-testid="comps-see-checked"
            className="min-h-11 px-3 rounded-(--radius-pill) border border-(--color-border-default) text-[12px] font-medium"
          >
            See what it is built from
          </button>
        </div>
      ) : visible.length === 0 ? (
        <div data-testid="comps-filter-empty" className="flex flex-col items-start gap-2">
          <p className="text-[12px] text-(--color-text-secondary) leading-relaxed">
            No comps match &ldquo;{FILTER_LABELS[activeFilter]}&rdquo;. All {comps.length} are still
            here and the ARV has not changed.
          </p>
          <button
            type="button"
            onClick={() => setFilter("all")}
            data-testid="comps-show-all"
            className="min-h-11 px-3 rounded-(--radius-pill) border border-(--color-border-default) text-[12px] font-medium"
          >
            Show all
          </button>
        </div>
      ) : activeTab === "market" ? (
        <div className="flex flex-col gap-2">
          <p className="text-[12px] text-(--color-text-secondary) leading-relaxed">
            Asking prices, not sales. These aren&apos;t judged and aren&apos;t in your
            resale price — they show what people are asking nearby right now.
          </p>
          <ul
            data-testid="comp-list"
            className="flex flex-col gap-2"
          >
            {visible.map((comp) => (
              <CompRow
                key={comp.id}
                comp={comp}
                note={notes.get(comp.id)}
                subject={subject}
                onReview={review}
                onRemove={remove}
              />
            ))}
          </ul>
        </div>
      ) : activeTab === "todo" && current ? (
        /* One house, filling the screen. The next arrives when this is saved. */
        <CompReviewCard
          key={current.id}
          comp={current}
          note={notes.get(current.id)}
          subject={subject}
          position={{ index: done + 1, total: visible.length + done }}
          onReview={(comp, next, sale) => {
            setDone((n) => n + 1);
            void review(comp, next, sale);
          }}
          onLater={() => setDeferred((ids) => [...ids, current.id])}
        />
      ) : (
        /* Checked is a scanning view, not a deciding one, so it stays a list.
           It used to cap its own height to keep the ARV card on screen; the
           sheet owns the scrolling now, and a scroll area inside a scrolling
           sheet is a thumb swiping the list while the sheet refuses to move. */
        <ul
          data-testid="comp-list"
          className="flex flex-col gap-2"
        >
          {visible.map((comp) => (
            <CompRow
              key={comp.id}
              comp={comp}
              note={notes.get(comp.id)}
              subject={subject}
              onReview={review}
              onRemove={remove}
            />
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
  note,
  subject,
  onReview,
  onRemove,
}: {
  comp: Comp;
  /** The ARV's verdict on this comp. Absent only before the first load. */
  note: CompNote | undefined;
  subject: SubjectFacts;
  onReview: (
    comp: Comp,
    review: CompReview,
    extra?: { sale?: { price: number; date: string | null }; notes?: string | null }
  ) => void;
  onRemove: (comp: Comp) => void;
}) {
  const [askingSale, setAskingSale] = useState(false);
  /**
   * Which site you last opened for this house, so you can find it again.
   *
   * This belongs here and not on the review card: there is only one card on
   * screen, so marking it says nothing. Here there are rows of houses that
   * look alike, and coming back from Zillow to a list is exactly where the
   * place gets lost. No label — the row is already named by its address, and
   * a sentence on every row would be noise.
   */
  const [opened, setOpened] = useState<CompLinkSource | null>(null);
  const against = comparedToSubject(comp, subject);
  // Empty on a house that cannot be judged, which is how the On-the-market
  // rows come out read-only without a second rule saying so.
  const reviewOptions = compReviewOptions(comp.status, comp.review);
  const ppsf = perSqft(comp);
  const date = compDate(comp);
  const provenance = provenanceLabel(comp);
  const reasons = note?.reasons ?? [];
  const counted = note?.counted ?? false;
  // Hints are suppressed on a comp already decided against: a warning about a
  // settled question is noise.
  // Was a hardcoded pair that never learned about took_off_market_skip, so
  // hints kept firing on a comp whose question was already settled.
  const skipped = isSkipped(comp.review);
  const fixerNote = note?.fixerUpper ? fixerUpperNote(comp) : null;

  return (
    <li
      data-testid={`comp-${comp.id}`}
      data-reviewing={opened ? "true" : undefined}
      className={`rounded-xl border p-3 transition-opacity ${
        opened
          ? "border-(--color-reviewing) bg-(--color-reviewing-tint)"
          : counted
            ? "border-(--color-accent) bg-(--color-elevated)"
            : "border-(--color-border-default)"
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium leading-snug wrap-break-word">
            {comp.formattedAddress}
          </p>

          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1.5">
            {comp.price !== null && priceLabel(comp) && (
              <span
                data-testid={`comp-price-meaning-${comp.id}`}
                className="text-[11px] text-(--color-text-secondary)"
              >
                {priceLabel(comp)}
              </span>
            )}
            <span className="text-[14px] font-semibold">
              {comp.price !== null ? dollars(comp.price) : "No price"}
            </span>
            {/* What was asked, and what was paid. Both, never one replacing
                the other — they are different facts about the same house. */}
            {comp.salePrice !== null && (
              <span
                data-testid={`comp-sale-price-${comp.id}`}
                className="text-[12px] font-semibold text-(--color-accent)"
              >
                · Sold for {dollars(comp.salePrice)}
                {comp.saleDate ? ` ${monthYear(comp.saleDate)}` : ""}
              </span>
            )}
            {ppsf && (
              <span className="text-[11px] text-(--color-text-secondary)">{ppsf}</span>
            )}
            <span
              className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5
              rounded-(--radius-pill) border ${STATUS_STYLE[comp.status] ?? STATUS_STYLE.active}`}
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
            {provenance && (
              <span
                data-testid={`comp-provenance-${comp.id}`}
                className="text-[10px] px-1.5 py-0.5 rounded bg-(--color-elevated) text-(--color-text-tertiary)"
              >
                {provenance}
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

          {/* Flagged, still counted. The tick box is the control — dropping a
              cheap sale on our own would quietly raise every ARV. */}
          {fixerNote && (
            <p
              data-testid={`comp-fixer-${comp.id}`}
              className="flex gap-1.5 text-[11px] text-amber-400 mt-1 leading-relaxed"
            >
              <AlertTriangle size={12} className="shrink-0 mt-0.5" />
              <span>{fixerNote}</span>
            </p>
          )}

          {/* Hints. They never decide anything — they are what the app
              noticed, for a person to weigh. */}
          {reasons.length > 0 && !skipped && (
            <p
              data-testid={`comp-hint-${comp.id}`}
              className={`text-[11px] mt-1 ${counted ? "text-(--color-text-secondary)" : "text-amber-400"}`}
            >
              {counted ? "Counted anyway — " : ""}
              {reasons.join(", ")}
            </p>
          )}

          {comp.reviewNotes && (
            <p
              data-testid={`comp-notes-${comp.id}`}
              className="text-[11px] text-(--color-text-primary) mt-1.5 px-2.5 py-1.5
                rounded-(--radius-md) bg-(--color-base) border border-(--color-border-subtle)"
            >
              {comp.reviewNotes}
            </p>
          )}

          {/* The comparison, already done. "3 bed" is above; whether 3 is the
              same as yours is the thing you were working out by hand. */}
          {against && (
            <p
              data-testid={`comp-vs-${comp.id}`}
              className="text-[11px] text-(--color-text-secondary) mt-1"
            >
              Next to yours: {against}
            </p>
          )}

          {/* Somewhere to go and check whether this one was renovated. */}
          <div className="mt-1.5">
            <CompLinks comp={comp} opened={opened} onOpen={setOpened} />
          </div>

          {/* The only control that moves the ARV. A native select, which is
              the right thing to tap on a phone. Absent entirely on a house
              that cannot be judged: an empty picker is worse than none. */}
          {reviewOptions.length > 0 && (
          <Dropdown
            className="mt-2"
            value={comp.review}
            options={reviewOptions.map((key) => ({
              value: key,
              label: COMP_REVIEW_LABELS[key],
              tone: REVIEW_TONE[key],
            }))}
            onChange={(next) => {
              // Approving a removed listing is a claim that it sold, so it
              // needs the figure it sold for. Asking here rather than
              // silently feeding the asking price into the ARV.
              if (next === "renovated_use" && comp.status === "removed") {
                setAskingSale(true);
                return;
              }
              setAskingSale(false);
              onReview(comp, next);
            }}
            label={`What to do with ${comp.formattedAddress}`}
            testId={`comp-review-${comp.id}`}
          />
          )}

          {askingSale && (
            <SalePricePrompt
              comp={comp}
              onCancel={() => setAskingSale(false)}
              onSave={(price, date) => {
                setAskingSale(false);
                onReview(comp, "renovated_use", { sale: { price, date } });
              }}
            />
          )}
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
  /**
   * Sold or Pending, and only here.
   *
   * RentCast reports Active or Inactive and nothing else, so an accepted
   * offer can only ever reach the app through a person. An agent's list
   * carries both, and calling a pending house sold would put a price that is
   * not final into the resale price.
   */
  const [status, setStatus] = useState<"sold" | "pending">("sold");
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
          status,
        }),
      });
      onAdded(await readResponse(res, "Failed to add the comp"));
      setAddress("");
      setPrice("");
      setSqft("");
      setSaleDate("");
      setStatus("sold");
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
        RentCast can only tell you a listing was removed, not what happened to
        it. Anything you enter here, it cannot know.
      </p>

      <div className="flex gap-2" role="radiogroup" aria-label="What happened to this house">
        {([
          ["sold", "It sold", "Counts toward your resale price once you review it."],
          ["pending", "Under contract", "Not final, so it stays out of your resale price."],
        ] as const).map(([value, label, why]) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={status === value}
            onClick={() => setStatus(value)}
            title={why}
            data-testid={`manual-comp-status-${value}`}
            className={`flex-1 min-h-11 px-3 rounded-(--radius-md) border text-[12px] font-medium
              transition-colors ${
                status === value
                  ? "border-(--color-accent) bg-(--color-accent-glow) text-(--color-accent)"
                  : "border-(--color-border-default) text-(--color-text-secondary)"
              }`}
          >
            {label}
          </button>
        ))}
      </div>

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
