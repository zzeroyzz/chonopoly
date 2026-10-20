"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { type MortgageInputs } from "@/lib/mortgage/types";
import { resolveInputs } from "@/lib/mortgage/resolveInputs";
import { calculateMortgage } from "@/lib/mortgage/calculate";
import { buildDeal } from "@/lib/deal/buildDeal";
import { explainDeal } from "@/lib/deal/explainDeal";
import { offerCeiling } from "@/lib/offers/offerCeiling";
import { calculateDti } from "@/lib/mortgage/dti";
import { calculate203kCap } from "@/lib/mortgage/renovationCap";
import { VERDICT_THRESHOLDS } from "@/lib/mortgage/defaults";
import { WhyPanel } from "./WhyPanel";
import { resolveRehab } from "@/lib/rehab/resolveRehab";
import { calculateRehab, budgetCheck } from "@/lib/rehab/calculateRehab";
import { type RehabEstimate } from "@/lib/rehab/types";
import { saveAnalysis } from "@/lib/mortgage/scenarioClient";
import { type BuyerProfile } from "@/lib/profile/types";
import { taxDefaultsFrom } from "@/lib/mortgage/capitalGains";
import { ProfitCard, type ProfitCardEdits } from "@/components/mortgage/ProfitCard";
import { Skeleton, SkeletonList, SkeletonRegion } from "@/components/ui/Skeleton";

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
  /** Opens Run the numbers prefilled at the estimate. */
  onRerunAtEstimate?: (rehabBudget: number) => void;
  /** Moves to the ARV step, for the Why checks that send you there. */
  onOpenArv?: () => void;
}

export function DealPanel({
  propertyId,
  ctxParams,
  state = null,
  onPrimaryChanged,
  onRerunAtEstimate,
  onOpenArv,
}: Props) {
  const [profile, setProfile] = useState<BuyerProfile | null>(null);
  const [arv, setArv] = useState<number | null>(null);
  /**
   * Whether anyone has made a call on the comps: one excluded, or one entered
   * by hand. Same rule the Properties list screens on, so the Why section
   * cannot call an ARV reviewed that the card calls provisional.
   */
  const [compsReviewed, setCompsReviewed] = useState(false);
  const [primaryInputs, setPrimaryInputs] = useState<MortgageInputs | null>(null);
  const [primaryLabel, setPrimaryLabel] = useState<string | null>(null);
  const [options, setOptions] = useState<
    { id: string; label: string; isPrimary: boolean }[]
  >([]);
  const [switching, setSwitching] = useState(false);
  const [rehabEstimate, setRehabEstimate] = useState<RehabEstimate | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [edits, setEdits] = useState<ProfitCardEdits>({});
  const [saving, setSaving] = useState(false);
  const [saveNote, setSaveNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    // Three independent reads, so they go together.
    const [profileRes, compsRes, listRes, rehabRes] = await Promise.all([
      fetch("/api/profile/buyer").catch(() => null),
      fetch(`/api/properties/${propertyId}/comps?${ctxParams}`).catch(() => null),
      fetch(`/api/mortgage/scenarios?${ctxParams}&property_id=${propertyId}`).catch(() => null),
      fetch(`/api/properties/${propertyId}/rehab?${ctxParams}`).catch(() => null),
    ]);

    if (rehabRes?.ok) {
      const body = (await rehabRes.json()) as { rehab: { estimate: RehabEstimate } | null };
      setRehabEstimate(body.rehab?.estimate ?? null);
    }

    if (profileRes?.ok) {
      const body = (await profileRes.json()) as { profile: BuyerProfile | null };
      setProfile(body.profile);
    }
    if (compsRes?.ok) {
      const body = (await compsRes.json()) as {
        arv?: { value: number | null } | null;
        comps?: { included: boolean; source: string }[];
      };
      setArv(body.arv?.value ?? null);
      const comps = body.comps ?? [];
      setCompsReviewed(
        comps.length > 0 && comps.some((c) => !c.included || c.source === "manual")
      );
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
    // One resolver, with the estimate plugged in. When there is none it falls
    // back to the budget and reads "Budget only".
    const contingency = {
      photosPct: profile?.defaults.contingencyPhotosPct ?? 20,
      visitPct: profile?.defaults.contingencyVisitPct ?? 10,
    };
    const estimated = rehabEstimate ? calculateRehab(rehabEstimate, contingency) : null;
    const rehab = resolveRehab(
      estimated ? { total: estimated.total, source: estimated.source } : null,
      inputs.renovationBudget
    );

    const deal = buildDeal(
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

    // Appended to what this memo already returns, rather than computed again
    // in a second one: the Why checks are measured against the financing
    // figures worked out directly above, and resolving the inputs and the
    // mortgage twice per render would be the same arithmetic twice.
    const dti = calculateDti(inputs, result);
    const renovationCap =
      inputs.renovationProgram === "none"
        ? null
        : calculate203kCap(inputs, {
            countyLoanLimit: profile?.defaults.countyLoanLimit ?? null,
            asIsValue: null,
          });

    return {
      ...deal,
      financing: {
        monthlyPayment: result.totalMonthlyWithMortgageInsurance,
        cashAfterClosing:
          (profile?.cashAvailable ?? 0) -
          (result.cashToClose + (renovationCap?.outOfPocketGap ?? 0)),
        // No guideline means the loan has no income test — hard money is
        // judged on the house. Passed on as "doesn't apply" rather than as a
        // limit of zero, which no borrower could ever clear.
        backDti: dti.applicable && dti.backGuideline !== null ? dti.backEnd : null,
        dtiLimit: dti.backGuideline ?? 0,
      },
      inputs,
      rehab,
    };
  }, [primaryInputs, profile, arv, edits, state, rehabEstimate]);

  /**
   * The verdict, one check at a time: what was measured, what it came to,
   * what it needed to be, and the thing that would fix it.
   *
   * The offer ceiling only runs when the deal falls short, because "offer
   * this instead" is only an answer then — and it costs a few dozen deal
   * builds. Same guard the Properties list uses.
   */
  const checks = useMemo(() => {
    if (!built) return [];

    const shortOfWorking =
      arv !== null && (built.result.trueProfit ?? 0) < VERDICT_THRESHOLDS.dealMinProfitWorks;
    const ceilingFor = (profitFloor: number) =>
      shortOfWorking
        ? offerCeiling({
            house: { arv, rehab: built.rehab, sellerClosingPct: profile?.defaults.sellingPct ?? 8 },
            inputs: built.inputs,
            profitFloor,
          }).price
        : null;

    return explainDeal({
      deal: built.result,
      cashAfterClosing: built.financing.cashAfterClosing,
      monthlyPayment: built.financing.monthlyPayment,
      backDti: built.financing.backDti,
      dtiLimit: built.financing.dtiLimit,
      arvUnreviewed: arv !== null && !compsReviewed,
      priceForWorks: ceilingFor(VERDICT_THRESHOLDS.dealMinProfitWorks),
      priceForThin: ceilingFor(VERDICT_THRESHOLDS.dealMinProfitThin),
    });
  }, [built, arv, compsReviewed, profile]);

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
    return (
      <SkeletonRegion label="Working out the deal" testId="deal-loading">
        <div className="mt-4">
          {/* Walk-away and true profit side by side, then the lines that add
              up to them. */}
          <div className="grid grid-cols-2 gap-2">
            <Skeleton className="h-16 rounded-[var(--radius-lg)]" />
            <Skeleton className="h-16 rounded-[var(--radius-lg)]" />
          </div>
          <SkeletonList count={5} gap="gap-2">
            {() => (
              <div className="flex items-center justify-between gap-3 pt-2">
                <Skeleton className="h-2.5 w-32" />
                <Skeleton className="h-2.5 w-16" />
              </div>
            )}
          </SkeletonList>
        </div>
      </SkeletonRegion>
    );
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
    const picked = options.find((o) => o.id === id);
    // One tap changes what the card, the header and both verdicts read, so it
    // asks first. Silently re-pointing every number in the app off a dropdown
    // is how the card and this tab came to disagree in the first place.
    if (
      typeof window !== "undefined" &&
      !window.confirm(
        `Use "${picked?.label ?? "this one"}" for this house's profit everywhere?\n\nIts numbers will show on the house, the Properties list and the verdicts.`
      )
    ) {
      return;
    }
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
    <div className="mt-4 grid gap-4">
      {/* The reasons first. This is the question people arrive on the tab
          with, and a verdict tag now taps straight through to it. */}
      <WhyPanel checks={checks} onOpenArv={onOpenArv} />

      <ProfitCard
        built={built}
        edits={edits}
        onChange={setEdits}
        budget={{
          check: budgetCheck(
            primaryInputs?.renovationBudget ?? 0,
            built?.params.rehabTotal ?? 0
          ),
          onRerun: onRerunAtEstimate
            ? () => onRerunAtEstimate(built?.params.rehabTotal ?? 0)
            : undefined,
        }}
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
