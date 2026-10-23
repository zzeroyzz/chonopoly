"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { useCrmContext } from "@/components/crm/useCrmContext";
import { Skeleton, SkeletonRegion } from "@/components/ui/Skeleton";
import { integrationLines, type RentCastStatus } from "@/lib/rentcast/integrationStatus";

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

  const lines = integrationLines(status);

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
          {lines.connected}
        </span>
      </div>

      {lines.mockNote && (
        <p
          data-testid="rentcast-mock-mode"
          className="text-[11px] text-(--color-text-secondary) bg-(--color-base) border border-(--color-border-default) rounded-lg px-3 py-2 leading-relaxed"
        >
          {lines.mockNote}
        </p>
      )}

      <div>
        <div className="flex items-baseline justify-between">
          <p data-testid="rentcast-usage" className="text-[13px]">
            <span className="font-semibold">{lines.used}</span>
            <span className="text-(--color-text-secondary)">{lines.ofLimit}</span>
          </p>
          <p className="text-[11px] text-(--color-text-secondary)">{lines.left}</p>
        </div>

        <div
          className="mt-2 h-1.5 w-full rounded-full bg-(--color-base) overflow-hidden"
          role="progressbar"
          aria-valuenow={lines.percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="RentCast requests used this month"
        >
          <div className={`h-full rounded-full ${barColor}`} style={{ width: `${lines.percent}%` }} />
        </div>
      </div>

      {lines.warning && (
        <p
          data-testid={lines.warning.kind === "at_limit" ? "rentcast-at-limit" : "rentcast-near-limit"}
          className={`flex gap-1.5 text-[11px] leading-relaxed ${
            lines.warning.kind === "at_limit" ? "text-red-400" : "text-amber-400"
          }`}
        >
          <AlertTriangle size={12} className="shrink-0 mt-0.5" />
          <span>{lines.warning.text}</span>
        </p>
      )}

      {lines.windowNote && (
        <p className="text-[11px] text-(--color-text-tertiary) leading-relaxed">
          {lines.windowNote}
        </p>
      )}

      {lines.noKeyNote && (
        <p className="text-[11px] text-(--color-text-secondary) leading-relaxed">
          {lines.noKeyNote}
        </p>
      )}
    </div>
  );
}
