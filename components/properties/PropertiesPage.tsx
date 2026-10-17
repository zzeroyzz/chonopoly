"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Home } from "lucide-react";
import { AppShell } from "@/components/shell/AppShell";
import { useCrmContext } from "@/components/crm/useCrmContext";
import { type PipelineRow } from "@/lib/crm/types";
import { STAGE_LABEL } from "@/lib/crm/stages";

/**
 * Every house, including the ones that are no longer leads.
 *
 * Distinct from the pipeline on purpose: the pipeline is what you are working,
 * this is everything you have looked at. A house you passed on still has
 * numbers worth keeping.
 */
export function PropertiesPage() {
  const router = useRouter();
  const { ctxParams } = useCrmContext();
  const [rows, setRows] = useState<PipelineRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ctxParams) return;
    let cancelled = false;
    (async () => {
      try {
        // includeTerminal: this list is everything, closed and dead included.
        const res = await fetch(`/api/crm/pipeline?${ctxParams}&include_terminal=1`);
        if (!res.ok) throw new Error("failed");
        const body = (await res.json()) as { rows: PipelineRow[] };
        if (!cancelled) setRows(body.rows);
      } catch {
        if (!cancelled) setRows([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ctxParams]);

  return (
    <AppShell
      appName="Park Hawkins Capital"
      userProfile={null}
      onboardingCompleted={null}
      onProfileClick={() => router.push("/settings/account")}
    >
      <div className="overflow-y-auto flex-1 w-full px-5 py-4 pb-24 lg:pb-8">
        <h1 className="text-[18px] font-semibold mb-1 text-(--color-text-primary)">Properties</h1>
        <p className="text-[12px] text-(--color-text-secondary) mb-4 leading-relaxed">
          Every house you have looked at, including the ones you passed on.
        </p>

        {loading && <p className="text-[12px] text-(--color-text-tertiary)">Loading…</p>}

        {!loading && rows.length === 0 && (
          <div className="text-[12px] text-(--color-text-secondary) leading-relaxed">
            <p>No houses yet.</p>
            <Link href="/properties/new" className="text-(--color-accent)">
              Add one →
            </Link>
          </div>
        )}

        {rows.map((row) => (
          <Link
            key={row.entry.id}
            href={`/properties/${row.entry.id}`}
            data-testid={`property-${row.entry.id}`}
            className="flex items-center gap-2.5 py-2.5 border-b border-(--color-border-subtle) last:border-0"
          >
            <Home size={14} className="text-(--color-text-tertiary) shrink-0" />
            <span className="flex-1 min-w-0 text-[13px] text-(--color-text-primary) truncate">
              {row.addressLine1}
            </span>
            <span className="text-[11px] text-(--color-text-tertiary) shrink-0">
              {STAGE_LABEL[row.entry.stage]}
            </span>
          </Link>
        ))}
      </div>
    </AppShell>
  );
}
