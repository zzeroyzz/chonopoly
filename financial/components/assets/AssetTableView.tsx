"use client";

import { useCallback, useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { formatMoney } from "@/components/budget/types";
import { StatCard } from "@/components/ui/StatCard";
import { ActiveContext } from "@/lib/goals/types";
import { AssetSummary, ASSET_TYPE_META } from "@/lib/assets/types";

// ─── AssetTableView ───────────────────────────────────────────────────────────

interface Props {
  activeContext: ActiveContext;
  onEdit: () => void;
}

export default function AssetTableView({ activeContext, onEdit: _onEdit }: Props) {
  const [assets, setAssets] = useState<AssetSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const ctxParams = `context_type=${activeContext.type}&context_id=${activeContext.id}`;

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/assets/summary?${ctxParams}`);
    const d = res.ok ? await res.json() : { assets: [] };
    setAssets(d.assets ?? []);
    setLoading(false);
  }, [ctxParams]);

  useEffect(() => { load(); }, [load]);

  async function deleteAsset(id: string) {
    if (!confirm("Delete this asset? This cannot be undone.")) return;
    setDeletingId(id);
    await fetch("/api/assets/delete", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ asset_id: id, context_type: activeContext.type, context_id: activeContext.id }),
    });
    await load();
    setDeletingId(null);
  }

  if (loading) return (
    <div className="space-y-px">
      {[...Array(4)].map((_, i) => <div key={i} className="h-11 skeleton rounded" />)}
    </div>
  );

  if (assets.length === 0) return (
    <p className="text-sm text-(--color-text-tertiary) py-10 text-center">No assets tracked.</p>
  );

  const totalAssetValue = assets.reduce((s, a) => s + a.current_value, 0);
  const totalNetEquity = assets.reduce((s, a) => s + a.net_equity, 0);

  return (
    <>
      <div className="grid gap-3 mb-5 grid-cols-1 sm:grid-cols-2">
        <StatCard label="Gross Value" value={`$${formatMoney(totalAssetValue)}`} />
        <StatCard
          label="Net Equity"
          value={totalNetEquity < 0 ? `-$${formatMoney(Math.abs(totalNetEquity))}` : `$${formatMoney(totalNetEquity)}`}
          variant={totalNetEquity >= 0 ? "success" : "danger"}
        />
      </div>
      <div className="overflow-x-auto">
      <table className="w-full border-collapse">
      <thead>
        <tr>
          {["Asset", "Type", "Value", "Linked Debt", "Net Equity", ""].map(h => (
            <th key={h} className="text-[10px] uppercase tracking-[0.08em] text-(--color-text-secondary) border-b border-(--color-border-default) sticky top-0 bg-(--color-base) z-10 py-2 px-3 text-left font-medium">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {assets.map(a => (
          <tr key={a.id} className="border-b border-(--color-border-subtle) group hover:bg-(--color-border-subtle)/20 transition-colors">
            {/* Asset */}
            <td className="px-3 py-2">
              <div className="flex items-center gap-2">
                <span className="text-[18px] leading-none">{a.icon}</span>
                <span className="text-[13px] text-(--color-text-primary)">{a.name}</span>
              </div>
            </td>
            {/* Type */}
            <td className="px-3 py-2" style={{ width: 100 }}>
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-(--color-border-default) text-(--color-text-secondary)">
                {ASSET_TYPE_META[a.asset_type]?.label ?? a.asset_type}
              </span>
            </td>
            {/* Value */}
            <td className="px-3 py-2" style={{ width: 110 }}>
              <span className="text-[13px] font-(--font-mono) text-(--color-success)">${formatMoney(a.current_value)}</span>
            </td>
            {/* Linked Debt */}
            <td className="px-3 py-2" style={{ width: 140 }}>
              <span className="text-[13px] text-(--color-text-secondary)">
                {a.linked_debt_name ?? "—"}
              </span>
            </td>
            {/* Net Equity */}
            <td className="px-3 py-2" style={{ width: 110 }}>
              <span className={`text-[13px] font-(--font-mono) ${a.net_equity >= 0 ? "text-(--color-success)" : "text-(--color-danger)"}`}>
                ${formatMoney(a.net_equity)}
              </span>
            </td>
            {/* Actions */}
            <td className="px-3 py-2" style={{ width: 40 }}>
              <button
                onClick={() => deleteAsset(a.id)}
                disabled={deletingId === a.id}
                className="p-1 text-(--color-text-tertiary) hover:text-(--color-danger) transition-colors disabled:opacity-30 opacity-0 group-hover:opacity-100"
              >
                <Trash2 size={13} />
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
      </div>
    </>
  );
}
