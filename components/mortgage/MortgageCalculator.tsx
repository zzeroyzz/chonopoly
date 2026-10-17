"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/shell/AppShell";
import { loadProfile } from "@/lib/supabase/profile";
import { useEffect } from "react";
import { type MortgageInputs } from "@/lib/mortgage/types";
import { loadInputs, saveInputs, clearInputs } from "@/lib/mortgage/storage";
import { defaultInputs } from "@/lib/mortgage/defaults";
import { calculateMortgage } from "@/lib/mortgage/calculate";
import { calculateAffordability, calculateRequiredIncome } from "@/lib/mortgage/affordability";
import { calculateDti } from "@/lib/mortgage/dti";
import { resolveInputs } from "@/lib/mortgage/resolveInputs";
import { type BuyerProfile, type ProfileState } from "@/lib/profile/types";
import { FirstRunIncomeModal } from "@/components/settings/FirstRunIncomeModal";
import { InputPanel } from "./InputPanel";
import { ResultsPanel } from "./ResultsPanel";
import { AffordabilityPanel } from "./AffordabilityPanel";
import { AmortizationSection } from "./AmortizationSection";
import { RateLookup } from "./RateLookup";
import { ScenarioBar } from "./ScenarioBar";

export default function MortgageCalculator() {
  const router = useRouter();

  // One serializable object rather than a field per useState — which is what
  // makes persisting the whole thing a one-liner.
  const [inputs, setInputs] = useState<MortgageInputs>(() => defaultInputs());
  const [restored, setRestored] = useState(false);

  // Read on mount rather than in the initializer. localStorage doesn't exist
  // during the server render, so initializing from it would render different
  // markup on the server and the client and break hydration. One setState on
  // mount is the accepted cost of that; the rule below is about cascading
  // renders, and this fires exactly once.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setInputs(loadInputs());
    setRestored(true);
  }, []);

  useEffect(() => {
    if (restored) saveInputs(inputs);
  }, [inputs, restored]);

  // The buyer profile. "none" is a real state, not an error: it drives the
  // "set your income" prompt instead of screening against a fabricated salary.
  const [profileState, setProfileState] = useState<ProfileState>({ kind: "loading" });
  const [showIncomeModal, setShowIncomeModal] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/profile/buyer");
        if (!res.ok) throw new Error("profile unavailable");
        const body = (await res.json()) as { profile: BuyerProfile | null };
        if (!cancelled) {
          setProfileState(body.profile ? { kind: "ready", profile: body.profile } : { kind: "none" });
        }
      } catch {
        // Treated as "no profile" rather than an error screen: the calculator
        // still works, it just cannot judge affordability yet.
        if (!cancelled) setProfileState({ kind: "none" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const [userProfile, setUserProfile] = useState<{
    name: string;
    avatarUrl: string | null;
    avatarColor: string | null;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const profile = await loadProfile();
        if (!cancelled) {
          setUserProfile({
            name: profile.username ?? "",
            avatarUrl: profile.avatar_url,
            avatarColor: profile.avatar_color,
          });
        }
      } catch {
        // Shell renders fine without a profile.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const patch = (p: Partial<MortgageInputs>) => setInputs((prev) => ({ ...prev, ...p }));

  // The three sources merged. `inputs` holds the house-shaped draft; the
  // profile supplies income, debts and the loan defaults.
  const resolved = useMemo(
    () =>
      resolveInputs(
        profileState.kind === "ready" ? profileState.profile : null,
        inputs
      ),
    [profileState, inputs]
  );

  const result = useMemo(() => calculateMortgage(resolved), [resolved]);
  const affordability = useMemo(() => calculateAffordability(resolved), [resolved]);
  // Your actual ratios and whether they clear. Computed once here so the
  // panel displays the same verdict the module calculates.
  const dti = useMemo(() => calculateDti(resolved, result), [resolved, result]);
  const required = useMemo(
    () => calculateRequiredIncome(resolved, result.totalMonthlyWithMortgageInsurance),
    [resolved, result.totalMonthlyWithMortgageInsurance]
  );


  return (
    <AppShell
      appName="Park Hawkins Capital"
      userProfile={userProfile}
      onboardingCompleted={null}
      onProfileClick={() => router.push("/settings/account")}
      // No contextSwitcher: the calculator has no scoped data, so nothing to scope.
    >
      <div className="overflow-y-auto flex-1 w-full px-5 py-4 pb-24 lg:pb-8">
        <h1 className="text-[18px] font-semibold mb-1 text-(--color-text-primary)">
          Mortgage calculator
        </h1>
        <div className="flex items-baseline justify-between gap-4 mb-5">
          <p className="text-[12px] text-(--color-text-secondary)">
            Your inputs stay put between visits. Save a scenario to keep it on your account.
          </p>
          <button
            type="button"
            onClick={() => {
              clearInputs();
              setInputs(defaultInputs());
            }}
            className="text-[12px] text-(--color-text-tertiary) hover:text-(--color-text-primary) transition-colors shrink-0"
          >
            Reset
          </button>
        </div>

        {/* Mobile stacks inputs first; desktop runs two columns. */}
        <div className="grid gap-4 lg:grid-cols-2 lg:gap-6" style={{ alignContent: "start" }}>
          <div className="grid gap-4" style={{ alignContent: "start" }}>
            <InputPanel
              inputs={resolved}
              onChange={patch}
              profileState={profileState}
              onSetIncome={() => setShowIncomeModal(true)}
            />
          </div>

          <div className="grid gap-4" style={{ alignContent: "start" }}>
            <ResultsPanel
              inputs={resolved}
              result={result}
              // Read from the same RequiredIncome the detail panel renders, so
              // the headline verdict and the breakdown cannot disagree.
              verdict={
                required.applicable && required.qualifies !== null
                  ? {
                      affordable: required.qualifies,
                      required: required.requiredMonthly,
                      actual: inputs.grossMonthlyIncome,
                    }
                  : undefined
              }
            />
            <AffordabilityPanel
              inputs={resolved}
              affordability={affordability}
              required={required}
              dti={dti}
            />
            <ScenarioBar
              inputs={resolved}
              monthlyPayment={result.totalMonthlyWithMortgageInsurance}
              // Replaces the working draft, and only from an explicit click.
              onLoad={(loaded) => setInputs(loaded)}
            />
            <RateLookup />
          </div>
        </div>

        <div className="mt-4">
          <AmortizationSection result={result} />
        </div>

        {showIncomeModal && (
          <FirstRunIncomeModal
            onCreated={(profile) => {
              setProfileState({ kind: "ready", profile });
              setShowIncomeModal(false);
            }}
            onClose={() => setShowIncomeModal(false)}
          />
        )}
      </div>
    </AppShell>
  );
}
