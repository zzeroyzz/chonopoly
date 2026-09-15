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
import { InputPanel } from "./InputPanel";
import { ResultsPanel } from "./ResultsPanel";
import { AffordabilityPanel } from "./AffordabilityPanel";
import { AmortizationSection } from "./AmortizationSection";
import { RateLookup } from "./RateLookup";

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

  const result = useMemo(() => calculateMortgage(inputs), [inputs]);
  const affordability = useMemo(() => calculateAffordability(inputs), [inputs]);
  const required = useMemo(
    () => calculateRequiredIncome(inputs, result.totalMonthlyWithMortgageInsurance),
    [inputs, result.totalMonthlyWithMortgageInsurance]
  );


  return (
    <AppShell
      appName="Park Hawkins Properties"
      userProfile={userProfile}
      onboardingCompleted={null}
      onProfileClick={() => router.push("/finances?tab=profile")}
      // No contextSwitcher: the calculator has no scoped data, so nothing to scope.
      asRoutes
      activeNavId="mortgage"
      onNavigate={() => {}}
    >
      <div className="overflow-y-auto flex-1 w-full px-5 py-4 pb-24 lg:pb-8">
        <h1 className="text-[18px] font-semibold mb-1 text-(--color-text-primary)">
          Mortgage calculator
        </h1>
        <div className="flex items-baseline justify-between gap-4 mb-5">
          <p className="text-[12px] text-(--color-text-secondary)">
            Your inputs stay put between visits. Nothing is saved to your account yet.
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
            <InputPanel inputs={inputs} onChange={patch} />
          </div>

          <div className="grid gap-4" style={{ alignContent: "start" }}>
            <ResultsPanel inputs={inputs} result={result} />
            <AffordabilityPanel inputs={inputs} affordability={affordability} required={required} />
            <RateLookup />
          </div>
        </div>

        <div className="mt-4">
          <AmortizationSection result={result} />
        </div>
      </div>
    </AppShell>
  );
}
