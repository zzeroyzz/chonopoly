"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { type MortgageInputs } from "@/lib/mortgage/types";
import { resolveInputs } from "@/lib/mortgage/resolveInputs";
import { calculateMortgage } from "@/lib/mortgage/calculate";
import { buildDeal } from "@/lib/deal/buildDeal";
import { resolveRehab } from "@/lib/rehab/resolveRehab";
import { saveAnalysis } from "@/lib/mortgage/scenarioClient";
import { type BuyerProfile } from "@/lib/profile/types";
import { taxDefaultsFrom } from "@/lib/mortgage/capitalGains";
import { ProfitCard, type ProfitCardEdits } from "@/components/mortgage/ProfitCard";

/**
 * The deal, on the house's Numbers tab.
 *
 * Prefilled from the primary financing analysis, the ARV and the rehab — the
 * three things the house already knows — so the only thing left to type is
 * what the app cannot know: how long you will hold it, what the accountant
 * says, and which fees the title company is charging.
 */

interface Props {
  propertyId: string;
  ctxParams: string;
  /** Two-letter state, for the state capital-gains rate. */
  state?: string | null;
  /** So the page can re-read its scenario rows when the primary moves. */
  onPrimaryChanged?: () => void;
}

export function DealPanel({ propertyId, ctxParams, state = null, onPrimaryChanged }: Props) {
  const [profile, setProfile] = useState<BuyerProfile | null>(null);
  const [arv, setArv] = useState<number | null>(null);
  const [primaryInputs, setPrimaryInputs] = useState<MortgageInputs | null>(null);
  const [primaryLabel, setPrimaryLabel] = useState<string | null>(null);
  const [options, setOptions] = useState<
    { id: string; label: string; isPrimary: boolean }[]
  >([]);
  const [switching, setSwitching] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [edits, setEdits] = useState<ProfitCardEdits>({});
  const [saving, setSaving] = useState(false);
  const [saveNote, setSaveNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    // Three independent reads, so they go together.
    const [profileRes, compsRes, listRes] = await Promise.all([
      fetch("/api/profile/buyer").catch(() => null),
      fetch(`/api/properties/${propertyId}/comps?${ctxParams}`).catch(() => null),
      fetch(`/api/mortgage/scenarios?${ctxParams}&property_id=${propertyId}`).catch(() => null),
    ]);

    if (profileRes?.ok) {
      const body = (await profileRes.json()) as { profile: BuyerProfile | null };
      setProfile(body.profile);
    }
    if (compsRes?.ok) {
      const body = (await compsRes.json()) as { arv?: { value: number | null } | null };
      setArv(body.arv?.value ?? null);
    }

    // The deal is worked back from the primary financing analysis — the one
    // the rest of the app means when it says "the price" and "the rehab".
    if (listRes?.ok) {
      const body = (await listRes.json()) as {
        scenarios: { id: string; label: string; isPrimary?: boolean; inputs: MortgageInputs }[];
      };
      const primary = body.scenarios.find((s) => s.isPrimary) ?? body.scenarios[0];
      setOptions(
        body.scenarios.map((s) => ({
          id: s.id,
          label: s.label,
          isPrimary: s.id === primary?.id,
        }))
      );
      if (primary) {
        // The list hands back the stored inputs now, so the detail fetch that
        // used to follow it is gone.
        setPrimaryInputs(primary.inputs);
        setPrimaryLabel(primary.label);
      }
    }
    setLoaded(true);
  }, [propertyId, ctxParams]);

  useEffect(() => {
    (async () => {
      await load();
    })();
  }, [load]);

  const built = useMemo(() => {
    if (!primaryInputs) return null;
    const inputs = resolveInputs(profile, primaryInputs);
    const result = calculateMortgage(inputs);
    // One resolver. Phase 3's estimate plugs in as the first argument.
    const rehab = resolveRehab(null, inputs.renovationBudget);

    return buildDeal(
      {
        inputs,
        result,
        arv,
        rehab,
        sellerClosingPct: profile?.defaults.sellingPct ?? 8,
        taxes: taxDefaultsFrom(profile?.defaults),
        state,
      },
      edits
    );
  }, [primaryInputs, profile, arv, edits, state]);

  if (loaded && !primaryInputs) {
    return (
      <p
        data-testid="deal-needs-numbers"
        className="text-[12px] text-(--color-text-secondary) leading-relaxed mt-4"
      >
        Run the numbers on this house first — the deal is worked back from the
        financing analysis, the ARV and the rehab.
      </p>
    );
  }

  if (!loaded || !built) {
    return <p className="text-[12px] text-(--color-text-secondary) mt-4">Working it out…</p>;
  }

  async function save() {
    if (!built || saving) return;
    setSaving(true);
    setSaveNote(null);
    try {
      await saveAnalysis({
        label: primaryLabel ? `Deal · ${primaryLabel}` : "Deal",
        // The deal reads from the financing analysis, so what is stored is the
        // financing inputs plus the handful of figures typed on top.
        inputs: primaryInputs as MortgageInputs,
        monthlyPayment: built.result.trueProfit ?? 0,
        propertyId,
        kind: "flip",
      });
      setSaveNote("Saved. Saving again under the same name adds a version.");
    } catch (e) {
      setSaveNote(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  async function makePrimary(id: string) {
    setSwitching(true);
    try {
      await fetch(`/api/mortgage/scenarios/${id}?${ctxParams}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_primary: true, context_type: "personal" }),
      });
      await load();
      onPrimaryChanged?.();
    } finally {
      setSwitching(false);
    }
  }

  return (
    <div className="mt-4">
      <ProfitCard
        built={built}
        edits={edits}
        onChange={setEdits}
        basedOn={{
          name: primaryLabel ?? "this house's numbers",
          options,
          onPick: (id) => void makePrimary(id),
          busy: switching,
        }}
        onSave={() => void save()}
        saving={saving}
        missingArvNote="Add comps on the Comps tab and tick the renovated ones, or enter an ARV by hand."
      />
      {saveNote && (
        <p data-testid="deal-save-note" className="text-[11px] text-(--color-accent) mt-2">
          {saveNote}
        </p>
      )}
    </div>
  );
}
