"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { useCrmContext } from "@/components/crm/useCrmContext";
import { Skeleton, SkeletonRegion } from "@/components/ui/Skeleton";

/**
 * RentCast's status and what's left of this month's allowance.
 *
 * The counter exists because the free plan is 50 requests a month and the
 * screening flow spends one per house. Someone pasting twenty addresses should
 * find that out here rather than by hitting a wall halfway through.
 *
 * The key itself never reaches this component, not even masked. There is
 * nothing useful to do with four characters of an API key.
 */

interface RentCastStatus {
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

export function IntegrationsPanel() {
  const { ctxParams } = useCrmContext();
  const [status, setStatus] = useState<RentCastStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ctxParams) return;
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(`/api/integrations/rentcast?${ctxParams}`);
        if (!res.ok) throw new Error((await res.json()).error ?? "Failed to load");
        const data = (await res.json()) as RentCastStatus;
        if (!cancelled) {
          setStatus(data);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load usage");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [ctxParams]);

  if (loading) {
    return (
      <SkeletonRegion label="Loading your usage" testId="integrations-loading">
        <div className="grid gap-2">
          <Skeleton className="h-2.5 w-28" />
          <Skeleton className="h-9 w-full rounded-[var(--radius-md)]" />
          <Skeleton className="h-2.5 w-40" />
        </div>
      </SkeletonRegion>
    );
  }

  if (error || !status) {
    return (
      <p
        data-testid="integrations-error"
        className="text-[12px] text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2.5"
      >
        {error ?? "Failed to load usage"}
      </p>
    );
  }

  const { usage } = status;
  const remaining = Math.max(0, usage.limit - usage.used);
  const percent = Math.min(100, Math.round(usage.fraction * 100));

  // Amber at the warning line, red at the wall — the bar should say which of
  // the two situations you are in before you read the numbers.
  const barColor = status.atLimit
    ? "bg-red-400"
    : status.nearLimit
      ? "bg-amber-400"
      : "bg-(--color-accent)";

  return (
    <div
      data-testid="rentcast-integration"
      className="rounded-xl border border-(--color-border-default) bg-(--color-elevated) p-4 flex flex-col gap-3"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[14px] font-semibold">RentCast</h2>
          <p className="text-[11px] text-(--color-text-secondary) mt-0.5">
            Property values and comparable sales
          </p>
        </div>

        <span
          data-testid="rentcast-connected"
          className={`shrink-0 flex items-center gap-1 text-[11px] font-medium ${
            status.connected ? "text-(--color-accent)" : "text-(--color-text-tertiary)"
          }`}
        >
          {status.connected ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
          {status.connected ? "Connected" : "Not connected"}
        </span>
      </div>

      {status.mode === "mock" && (
        <p
          data-testid="rentcast-mock-mode"
          className="text-[11px] text-(--color-text-secondary) bg-(--color-base) border border-(--color-border-default) rounded-lg px-3 py-2 leading-relaxed"
        >
          This deployment uses sample comps and never calls RentCast, so the
          count below stays where it is. Only production spends requests.
        </p>
      )}

      <div>
        <div className="flex items-baseline justify-between">
          <p data-testid="rentcast-usage" className="text-[13px]">
            <span className="font-semibold">{usage.used}</span>
            <span className="text-(--color-text-secondary)"> of {usage.limit} this month</span>
          </p>
          <p className="text-[11px] text-(--color-text-secondary)">
            {remaining} left
          </p>
        </div>

        <div
          className="mt-2 h-1.5 w-full rounded-full bg-(--color-base) overflow-hidden"
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="RentCast requests used this month"
        >
          <div className={`h-full rounded-full ${barColor}`} style={{ width: `${percent}%` }} />
        </div>
      </div>

      {status.atLimit && (
        <p
          data-testid="rentcast-at-limit"
          className="flex gap-1.5 text-[11px] text-red-400 leading-relaxed"
        >
          <AlertTriangle size={12} className="shrink-0 mt-0.5" />
          <span>
            This month&apos;s requests are used up. Comps can still be entered by hand
            on any property.
          </span>
        </p>
      )}

      {status.nearLimit && !status.atLimit && (
        <p
          data-testid="rentcast-near-limit"
          className="flex gap-1.5 text-[11px] text-amber-400 leading-relaxed"
        >
          <AlertTriangle size={12} className="shrink-0 mt-0.5" />
          <span>
            {Math.round(status.warningFraction * 100)}% of this month&apos;s requests are
            used. {remaining} left — each property you screen spends one.
          </span>
        </p>
      )}

      {status.cacheWindowDays && (
        <p className="text-[11px] text-(--color-text-tertiary) leading-relaxed">
          Each property is looked up at most once every {status.cacheWindowDays} days,
          and the app stops at {status.usage.limit}
          {status.usage.planLimit ? ` of the plan's ${status.usage.planLimit}` : ""} so
          RentCast&apos;s own count can never catch us short.
        </p>
      )}

      {!status.connected && (
        <p className="text-[11px] text-(--color-text-secondary) leading-relaxed">
          Without a key, comps have to be entered by hand. Every other part of
          screening works as normal.
        </p>
      )}
    </div>
  );
}
