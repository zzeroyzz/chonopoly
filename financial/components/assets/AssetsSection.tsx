"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useState } from "react";
import { Plus, RefreshCw, Trash2, Pencil, Package } from "lucide-react";
import { ActiveContext } from "@/lib/goals/types";
import { AssetSummary, AssetType, ASSET_TYPE_META, ASSET_ICONS } from "@/lib/assets/types";
import { DebtSummary } from "@/lib/debts/types";
import { formatMoney } from "@/components/budget/types";
import { StatCard } from "@/components/ui/StatCard";

const ASSET_TYPES = Object.entries(ASSET_TYPE_META) as [AssetType, { label: string; icon: string }][];

interface Props {
  activeContext: ActiveContext;
  openWithDebtId?: string | null;
  onClearOpenWithDebt?: () => void;
}

export interface AssetsSectionHandle { triggerCreate: () => void }

const AssetsSection = forwardRef<AssetsSectionHandle, Props>(
  function AssetsSection({ activeContext, openWithDebtId, onClearOpenWithDebt }, ref) {
  const ctxParams = `context_type=${activeContext.type}&context_id=${activeContext.id}`;

  const [assets, setAssets]           = useState<AssetSummary[]>([]);
  const [claimedDebtIds, setClaimedDebtIds] = useState<string[]>([]);
  const [availableDebts, setAvailableDebts] = useState<DebtSummary[]>([]);
  const [loading, setLoading]         = useState(true);
  const [view, setView]               = useState<"list" | "wizard">("list");
  const [editingAsset, setEditingAsset] = useState<AssetSummary | null>(null);
  const [deleting, setDeleting]       = useState<string | null>(null);
  const [mobileActionsOpen, setMobileActionsOpen] = useState<Set<string>>(new Set());

  // Wizard state
  const [step, setStep]         = useState<1 | 2 | 3>(1);
  const [wName, setWName]       = useState("");
  const [wIcon, setWIcon]       = useState("💎");
  const [wType, setWType]       = useState<AssetType>("other");
  const [wValue, setWValue]     = useState("");
  const [wDebtId, setWDebtId]   = useState<string | null>(null);
  const [wSaving, setWSaving]   = useState(false);
  const [wError, setWError]     = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [assetsRes, debtsRes] = await Promise.all([
        fetch(`/api/assets/summary?${ctxParams}`).then(r => r.json()),
        fetch(`/api/debts/summary?${ctxParams}`).then(r => r.json()),
      ]);
      setAssets(assetsRes.assets ?? []);
      setClaimedDebtIds(assetsRes.claimed_debt_ids ?? []);
      setAvailableDebts((debtsRes.debts ?? []).filter((d: DebtSummary) => d.status === "active"));
    } finally {
      setLoading(false);
    }
  }, [ctxParams]);

  useEffect(() => { load(); }, [load]);

  // When triggered from a debt's "Add as asset" button, open wizard pre-linked to that debt
  useEffect(() => {
    if (!openWithDebtId || loading) return;
    const alreadyLinked = assets.find(a => a.linked_debt_id === openWithDebtId);
    if (alreadyLinked) {
      openEdit(alreadyLinked);
    } else {
      setEditingAsset(null);
      setWName(""); setWIcon("💎"); setWType("other");
      setWValue(""); setWDebtId(openWithDebtId);
      setWError(""); setStep(1);
      setView("wizard");
    }
    onClearOpenWithDebt?.();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openWithDebtId, loading]);

  // Debts available for the picker: exclude those already claimed by another asset
  // (when editing, allow the current asset's linked debt to appear)
  const pickableDebts = availableDebts.filter(d =>
    !claimedDebtIds.includes(d.id) || d.id === editingAsset?.linked_debt_id
  );

  function openCreate() {
    setEditingAsset(null);
    setWName(""); setWIcon("💎"); setWType("other");
    setWValue(""); setWDebtId(null);
    setWError(""); setStep(1);
    setView("wizard");
  }

  useImperativeHandle(ref, () => ({ triggerCreate: openCreate }));

  function openEdit(asset: AssetSummary) {
    setEditingAsset(asset);
    setWName(asset.name); setWIcon(asset.icon); setWType(asset.asset_type);
    setWValue(String(asset.current_value)); setWDebtId(asset.linked_debt_id);
    setWError(""); setStep(1);
    setView("wizard");
  }

  async function submit() {
    setWSaving(true); setWError("");
    const body = {
      name: wName, icon: wIcon, asset_type: wType,
      current_value: Number(wValue),
      linked_debt_id: wDebtId,
      context_type: activeContext.type,
      context_id: activeContext.id,
    };
    try {
      const res = editingAsset
        ? await fetch("/api/assets/update", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, asset_id: editingAsset.id }) })
        : await fetch("/api/assets/create", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

      if (!res.ok) {
        const err = await res.json();
        setWError(err.error ?? "Something went wrong.");
        setWSaving(false);
        return;
      }
      await load();
      setView("list");
    } catch {
      setWError("Something went wrong. Please try again.");
    } finally {
      setWSaving(false);
    }
  }

  async function deleteAsset(id: string) {
    if (!confirm("Delete this asset? This cannot be undone.")) return;
    setDeleting(id);
    await fetch("/api/assets/delete", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ asset_id: id, context_type: activeContext.type, context_id: activeContext.id }) });
    await load();
    setDeleting(null);
  }

  // ─── Wizard ────────────────────────────────────────────────────────────────

  if (view === "wizard") {
    return (
      <div className="space-y-4">
        {/* Progress */}
        <div className="flex items-center justify-center gap-1.5">
          {([1, 2, 3] as const).map(n => (
            <div key={n} className={`rounded-full transition-all ${step === n ? "w-4 h-1.5 bg-white" : step > n ? "w-1.5 h-1.5 bg-white/40" : "w-1.5 h-1.5 bg-[#2e2e38]"}`} />
          ))}
        </div>

        <div className="bg-[#1e1e24] border border-[#2e2e38] rounded-xl p-5 space-y-5">
          <p className="text-sm font-semibold">{editingAsset ? "Edit asset" : "Add an asset"}</p>

          {/* Step 1: Name, type, icon */}
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <p className="text-[10px] text-[#7a7870] uppercase tracking-widest mb-2">Asset name</p>
                <input
                  className="w-full bg-[#16161c] border border-[#2e2e38] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-white/30"
                  placeholder="e.g. My Car, Primary Home"
                  value={wName}
                  onChange={e => setWName(e.target.value)}
                  autoFocus
                />
              </div>
              <div>
                <p className="text-[10px] text-[#7a7870] uppercase tracking-widest mb-2">Type</p>
                <div className="flex flex-wrap gap-2">
                  {ASSET_TYPES.map(([key, meta]) => (
                    <button
                      key={key}
                      onClick={() => { setWType(key); setWIcon(meta.icon); }}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border transition-colors ${wType === key ? "bg-white text-black border-white" : "border-[#2e2e38] text-[#7a7870] hover:text-white hover:border-white/20"}`}
                    >
                      {meta.icon} {meta.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-[10px] text-[#7a7870] uppercase tracking-widest mb-2">Icon</p>
                <div className="flex gap-2 flex-wrap">
                  {ASSET_ICONS.map(e => (
                    <button key={e} onClick={() => setWIcon(e)} className={`text-xl p-1.5 rounded-lg transition-colors ${wIcon === e ? "bg-white/15" : "hover:bg-white/8"}`}>{e}</button>
                  ))}
                </div>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setView("list")} className="flex-1 py-2.5 text-sm text-[#7a7870] border border-[#2e2e38] rounded-xl hover:text-white transition-colors">Cancel</button>
                <button onClick={() => setStep(2)} disabled={wName.length < 1} className="flex-1 py-2.5 text-sm font-semibold bg-white text-black rounded-xl disabled:opacity-30 hover:bg-white/90 transition-colors">Next →</button>
              </div>
            </div>
          )}

          {/* Step 2: Current value */}
          {step === 2 && (
            <div className="space-y-4">
              <div>
                <p className="text-[10px] text-[#7a7870] uppercase tracking-widest mb-2">Current market value</p>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[#55534e] text-sm">$</span>
                  <input
                    type="number" min="0" step="0.01"
                    className="w-full bg-[#16161c] border border-[#2e2e38] rounded-xl pl-7 pr-4 py-2.5 text-sm focus:outline-none focus:border-white/30"
                    placeholder="0.00"
                    value={wValue}
                    onChange={e => setWValue(e.target.value)}
                    autoFocus
                  />
                </div>
                <p className="text-[10px] text-[#55534e] mt-1">Enter what this asset is worth today, not what you paid for it.</p>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setStep(1)} className="flex-1 py-2.5 text-sm text-[#7a7870] border border-[#2e2e38] rounded-xl hover:text-white transition-colors">← Back</button>
                <button onClick={() => setStep(3)} disabled={!wValue || Number(wValue) <= 0} className="flex-1 py-2.5 text-sm font-semibold bg-white text-black rounded-xl disabled:opacity-30 hover:bg-white/90 transition-colors">Next →</button>
              </div>
            </div>
          )}

          {/* Step 3: Link a debt (optional) */}
          {step === 3 && (
            <div className="space-y-4">
              <div>
                <p className="text-[10px] text-[#7a7870] uppercase tracking-widest mb-1">Link a debt <span className="text-[#55534e] normal-case">(optional)</span></p>
                <p className="text-[11px] text-[#55534e] mb-3">Link a loan that's backed by this asset to track net equity (e.g., auto loan on your car, mortgage on your home).</p>

                {/* No debt option */}
                <button
                  onClick={() => setWDebtId(null)}
                  className={`w-full text-left px-3 py-2.5 rounded-xl text-xs border mb-2 transition-colors ${wDebtId === null ? "bg-white/8 border-white/20 text-white" : "border-[#2e2e38] text-[#55534e] hover:text-white hover:border-white/10"}`}
                >
                  No linked debt — track gross value only
                </button>

                {pickableDebts.length === 0 && (
                  <p className="text-[11px] text-[#55534e] py-2">No eligible debts available. Add a debt first to link it here.</p>
                )}

                {pickableDebts.map(debt => (
                  <button
                    key={debt.id}
                    onClick={() => setWDebtId(debt.id)}
                    className={`w-full text-left px-3 py-2.5 rounded-xl text-xs border mb-1.5 transition-colors ${wDebtId === debt.id ? "bg-white/8 border-white/20 text-white" : "border-[#2e2e38] text-[#7a7870] hover:text-white hover:border-white/10"}`}
                  >
                    <div className="flex items-center justify-between">
                      <span>{debt.icon} {debt.name}</span>
                      <span className="font-(--font-mono) text-red-400">${formatMoney(debt.current_balance)}</span>
                    </div>
                    {wDebtId === debt.id && wValue && (
                      <p className="text-emerald-400 mt-1">Net equity: ${formatMoney(Math.max(0, Number(wValue) - debt.current_balance))}</p>
                    )}
                  </button>
                ))}
              </div>

              {wError && <p className="text-xs text-red-400">{wError}</p>}

              <div className="flex gap-3">
                <button onClick={() => setStep(2)} disabled={wSaving} className="flex-1 py-2.5 text-sm text-[#7a7870] border border-[#2e2e38] rounded-xl hover:text-white transition-colors">← Back</button>
                <button
                  onClick={submit}
                  disabled={wSaving}
                  data-testid="asset-save-btn"
                  className="flex-1 py-2.5 text-sm font-semibold bg-white text-black rounded-xl disabled:opacity-50 hover:bg-white/90 transition-colors flex items-center justify-center gap-2"
                >
                  {wSaving ? <><RefreshCw size={13} className="animate-spin" /> Saving…</> : editingAsset ? "Save changes" : "Add asset"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ─── List view ─────────────────────────────────────────────────────────────

  const totalAssetValue = assets.reduce((s, a) => s + a.current_value, 0);
  const totalNetEquity  = assets.reduce((s, a) => s + a.net_equity, 0);

  return (
    <div className="space-y-4" data-testid="assets-section">
      <div className="flex items-center justify-between pt-2">
        <p className="text-[10px] text-[#55534e] uppercase tracking-widest">Assets</p>
        <button onClick={openCreate} className="flex items-center gap-1 text-xs text-[#7a7870] hover:text-white transition-colors" data-testid="add-asset-btn">
          <Plus size={13} /> Add asset
        </button>
      </div>
      {assets.length > 0 && (
        <>
          <div className="lg:hidden grid grid-cols-2 gap-2 mb-5">
            <div className="bg-[#1e1e24] border border-[#2e2e38] rounded-xl px-4 py-3">
              <p className="text-[11px] text-[#55534e] mb-0.5">Gross Value</p>
              <p className="text-[18px] font-semibold font-(--font-mono) text-white">${formatMoney(totalAssetValue)}</p>
            </div>
            <div className="bg-[#1e1e24] border border-[#2e2e38] rounded-xl px-4 py-3">
              <p className="text-[11px] text-[#55534e] mb-0.5">Net Equity</p>
              <p className={`text-[18px] font-semibold font-(--font-mono) ${totalNetEquity >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                {totalNetEquity < 0 ? `-$${formatMoney(Math.abs(totalNetEquity))}` : `$${formatMoney(totalNetEquity)}`}
              </p>
            </div>
          </div>
          <div className="hidden lg:grid gap-3 mb-5 grid-cols-2">
            <StatCard label="Gross Value" value={`$${formatMoney(totalAssetValue)}`} />
            <StatCard
              label="Net Equity"
              value={totalNetEquity < 0 ? `-$${formatMoney(Math.abs(totalNetEquity))}` : `$${formatMoney(totalNetEquity)}`}
              variant={totalNetEquity >= 0 ? "success" : "danger"}
            />
          </div>
        </>
      )}

      {loading && (
        <div className="flex justify-center py-8">
          <RefreshCw size={14} className="animate-spin text-[#7a7870]" />
        </div>
      )}

      {!loading && assets.length === 0 && (
        <div className="text-center py-10 space-y-3">
          <Package size={28} className="text-[#2e2e38] mx-auto" />
          <div>
            <p className="text-sm font-medium text-white">No assets tracked</p>
            <p className="text-xs text-[#55534e] mt-1">Add your car, home, investments, or anything you own.</p>
          </div>
          <button onClick={openCreate} className="px-4 py-2 text-sm font-semibold bg-white text-black rounded-xl hover:bg-white/90 transition-colors" data-testid="add-first-asset-btn">
            Add your first asset
          </button>
        </div>
      )}

      {!loading && assets.map(asset => (
        <div key={asset.id} className="bg-[#1e1e24] border border-[#2e2e38] rounded-xl p-4" data-testid="asset-card">
          {/* Mobile asset row */}
          <div className="lg:hidden flex items-center gap-3 mb-2">
            <span className="text-[28px] w-10 h-10 flex items-center justify-center shrink-0">{asset.icon}</span>
            <div className="flex-1 min-w-0">
              <p className="text-[15px] font-semibold text-white truncate">{asset.name}</p>
              <p className="text-[12px] text-[#7a7870]">{ASSET_TYPE_META[asset.asset_type]?.label ?? asset.asset_type}</p>
            </div>
            <div className="shrink-0 flex flex-col items-end gap-1">
              <p className="text-[20px] font-semibold font-(--font-mono) text-white">${formatMoney(asset.current_value)}</p>
              <button
                onClick={e => { e.stopPropagation(); setMobileActionsOpen(prev => { const next = new Set(prev); next.has(asset.id) ? next.delete(asset.id) : next.add(asset.id); return next; }); }}
                className="text-[11px] text-[#55534e] hover:text-white transition-colors"
              >
                •••
              </button>
            </div>
          </div>
          {mobileActionsOpen.has(asset.id) && (
            <div className="lg:hidden flex items-center gap-3 pb-2 mb-2 border-b border-[#2e2e38]">
              <button onClick={() => { openEdit(asset); setMobileActionsOpen(new Set()); }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] text-[#7a7870] hover:text-white bg-white/5 rounded-lg transition-colors">
                <Pencil size={12} /> Edit
              </button>
              <button onClick={() => deleteAsset(asset.id)} disabled={deleting === asset.id}
                className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] text-[#7a7870] hover:text-red-400 bg-white/5 rounded-lg transition-colors">
                <Trash2 size={12} /> Delete
              </button>
            </div>
          )}
          {/* Desktop asset row — unchanged */}
          <div className="hidden lg:flex items-start justify-between mb-2">
            <div className="flex items-center gap-3">
              <span className="text-xl">{asset.icon}</span>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-semibold">{asset.name}</p>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/6 text-[#7a7870]">
                    {ASSET_TYPE_META[asset.asset_type]?.label ?? asset.asset_type}
                  </span>
                </div>
                <div className="flex items-center gap-3 mt-0.5">
                  <p className="text-xs text-[#7a7870]">
                    Value: <span className="text-white font-(--font-mono)">${formatMoney(asset.current_value)}</span>
                  </p>
                  {asset.linked_debt_id && (
                    <p className="text-xs text-[#55534e]">
                      Equity: <span className={`font-(--font-mono) ${asset.net_equity >= 0 ? "text-emerald-400" : "text-red-400"}`}>${formatMoney(asset.net_equity)}</span>
                    </p>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 ml-2">
              <button onClick={() => openEdit(asset)} className="text-[#7a7870] hover:text-white transition-colors"><Pencil size={13} /></button>
              <button onClick={() => deleteAsset(asset.id)} disabled={deleting === asset.id} className="text-[#7a7870] hover:text-red-400 transition-colors"><Trash2 size={13} /></button>
            </div>
          </div>

          {asset.linked_debt_name && (
            <div className="flex items-center justify-between text-[10px] text-[#55534e] bg-[#16161c] rounded-lg px-3 py-1.5">
              <span>Liability: {asset.linked_debt_name}</span>
              <span className="font-(--font-mono) text-red-400">${formatMoney(asset.linked_debt_balance ?? 0)}</span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
});

export default AssetsSection;
