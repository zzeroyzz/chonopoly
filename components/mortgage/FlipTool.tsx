"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Home } from "lucide-react";
import { ToolSwitch } from "./ToolSwitch";
import { loadProfile } from "@/lib/supabase/profile";
import { defaultInputs } from "@/lib/mortgage/defaults";
import { calculateMortgage } from "@/lib/mortgage/calculate";
import { buildDeal } from "@/lib/deal/buildDeal";
import { resolveRehab } from "@/lib/rehab/resolveRehab";
import { DEFAULT_TAX_DEFAULTS } from "@/lib/mortgage/capitalGains";
import { saveAnalysis } from "@/lib/mortgage/scenarioClient";
import { type LoanType } from "@/lib/mortgage/types";
import { LOAN_PRODUCTS } from "@/lib/mortgage/loanTypes";
import { Card, SectionLabel, NumberField, SelectField } from "./fields";
import { ProfitCard, type ProfitCardEdits } from "./ProfitCard";

/**
 * Flip profit, with nothing required.
 *
 * The same calculation the property page runs, with every figure typed instead
 * of read off a house. Quick math for a listing someone just sent you, before
 * it is worth adding to the pipeline at all.
 *
 * Saving is optional and attaches to a house that already exists — properties
 * are created in one place, Add.
 */
export default function FlipTool() {

  const [userProfile, setUserProfile] = useState<{
    name: string;
    avatarUrl: string | null;
    avatarColor: string | null;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const p = await loadProfile();
        if (!cancelled) {
          setUserProfile({
            name: p.username ?? "",
            avatarUrl: p.avatar_url,
            avatarColor: p.avatar_color,
          });
        }
      } catch {
        // The shell renders fine without it.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Everything typed. No profile, no house, no ARV required to start.
  const [product, setProduct] = useState("fha203k");
  const [price, setPrice] = useState(200_000);
  const [rehab, setRehab] = useState(50_000);
  const [arv, setArv] = useState(325_000);
  const [rate, setRate] = useState(15);
  const [points, setPoints] = useState(2);
  const [sellerClosingPct, setSellerClosingPct] = useState(6);
  const [edits, setEdits] = useState<ProfitCardEdits>({});

  const [houses, setHouses] = useState<{ propertyId: string; address: string }[]>([]);
  const [houseQuery, setHouseQuery] = useState("");
  const [picking, setPicking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const built = useMemo(() => {
    const chosen = LOAN_PRODUCTS.find((p) => p.value === product);
    const loanType: LoanType = chosen?.loanType ?? "fha";

    // Built directly rather than through resolveInputs: there is no profile
    // here, and every figure on this page is typed.
    const inputs = {
      ...defaultInputs(),
      loanType,
      renovationProgram: chosen?.renovationProgram ?? "none",
      homeValue: price,
      renovationBudget: rehab,
      interestRate: rate,
      points,
      arv,
      afterRepairValue: arv,
    };
    const result = calculateMortgage(inputs);

    return buildDeal(
      {
        inputs,
        result,
        arv: arv > 0 ? arv : null,
        rehab: resolveRehab(null, rehab),
        sellerClosingPct,
        // No profile here, so the module's rates stand in. The estimate is
        // still shown with its working and stays overridable.
        taxes: DEFAULT_TAX_DEFAULTS,
        state: "GA",
      },
      edits
    );
  }, [product, price, rehab, arv, rate, points, sellerClosingPct, edits]);

  async function loadHouses() {
    try {
      const res = await fetch("/api/properties/screen?context_type=personal");
      if (!res.ok) return;
      const body = (await res.json()) as { rows: { propertyId: string; address: string }[] };
      setHouses(body.rows.map((r) => ({ propertyId: r.propertyId, address: r.address })));
    } catch {
      // Nothing to pick is not a broken page.
    }
  }

  async function saveTo(propertyId: string, address: string) {
    setSaving(true);
    setNote(null);
    try {
      await saveAnalysis({
        label: `Deal · ${address}`,
        inputs: built.params.arv
          ? { ...defaultInputs(), homeValue: price, renovationBudget: rehab, arv }
          : { ...defaultInputs(), homeValue: price, renovationBudget: rehab },
        monthlyPayment: built.result.trueProfit ?? 0,
        propertyId,
        kind: "flip",
      });
      setNote(`Saved to ${address}.`);
      setPicking(false);
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  const matches = houses.filter((h) =>
    h.address.toLowerCase().includes(houseQuery.trim().toLowerCase())
  );

  return (
    <>
      <div className="overflow-y-auto flex-1 w-full px-5 py-4 pb-24 lg:pb-8">
        <h1 className="text-[18px] font-semibold mb-1 text-(--color-text-primary)">
          Flip profit
        </h1>
        <ToolSwitch active="flip" />
        <p className="text-[12px] text-(--color-text-secondary) mb-5">
          Quick math on a listing. Nothing here is required, and nothing is saved
          unless you pick a house.
        </p>

        <div className="grid gap-4 lg:grid-cols-2 lg:gap-6" style={{ alignContent: "start" }}>
          <Card>
            <SectionLabel>The deal</SectionLabel>
            <div className="grid gap-3.5">
              <SelectField
                label="Loan"
                value={product}
                onChange={setProduct}
                options={LOAN_PRODUCTS.map((p) => ({ value: p.value, label: p.label }))}
              />
              <NumberField label="Purchase price" testId="flip-price" value={price} onChange={setPrice} prefix="$" min={0} />
              <NumberField label="Rehab" testId="flip-rehab" value={rehab} onChange={setRehab} prefix="$" min={0} />
              <NumberField label="ARV" testId="flip-arv" value={arv} onChange={setArv} prefix="$" min={0} />
              <div className="grid grid-cols-2 gap-3">
                <NumberField label="Rate" value={rate} onChange={setRate} suffix="%" min={0} />
                <NumberField label="Points" value={points} onChange={setPoints} suffix="%" min={0} />
              </div>
              <NumberField
                label="Seller closing"
                value={sellerClosingPct}
                onChange={setSellerClosingPct}
                suffix="%"
                hint="of the ARV"
                min={0}
              />
            </div>
          </Card>

          <div className="grid gap-4" style={{ alignContent: "start" }}>
            <ProfitCard built={built} edits={edits} onChange={setEdits} />

            <Card>
              <SectionLabel>Keep it</SectionLabel>
              {picking ? (
                <div className="grid gap-2">
                  <input
                    value={houseQuery}
                    onChange={(e) => setHouseQuery(e.target.value)}
                    placeholder="Search your houses by address"
                    aria-label="Search houses by address"
                    data-testid="flip-house-search"
                    className="w-full h-9 rounded-md bg-(--color-elevated) border border-(--color-border-default) px-3 text-[13px] text-(--color-text-primary) focus:outline-none focus:border-(--color-accent)"
                  />
                  <div className="max-h-40 overflow-y-auto">
                    {matches.length === 0 ? (
                      <p className="text-[11px] text-(--color-text-tertiary) leading-relaxed">
                        No house matches. Houses are added from{" "}
                        <span className="text-(--color-text-secondary)">+ Add</span> —
                        saving here never creates one.
                      </p>
                    ) : (
                      matches.map((h) => (
                        <button
                          key={h.propertyId}
                          type="button"
                          disabled={saving}
                          onClick={() => void saveTo(h.propertyId, h.address)}
                          data-testid={`flip-house-${h.propertyId}`}
                          className="block w-full text-left text-[12px] text-(--color-text-primary) py-2 border-b border-(--color-border-subtle) last:border-0 truncate disabled:opacity-40"
                        >
                          {h.address}
                        </button>
                      ))
                    )}
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setPicking(true);
                    if (houses.length === 0) void loadHouses();
                  }}
                  data-testid="flip-save-to-house"
                  className="inline-flex items-center gap-1.5 text-[12px] text-(--color-accent)"
                >
                  <Home size={12} />
                  Save to a house (optional)
                </button>
              )}
              {note && <p className="text-[11px] text-(--color-accent) mt-2">{note}</p>}
            </Card>
          </div>
        </div>
      </div>
    </>
  );
}
