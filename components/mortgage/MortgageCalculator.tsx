"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/shell/AppShell";
import { loadProfile } from "@/lib/supabase/profile";
import { useEffect } from "react";
import { type MortgageInputs } from "@/lib/mortgage/types";
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

  // One serializable object rather than a field per useState — persistence isn't
  // in scope, but this is the seam it would hang off if it ever is.
  const [inputs, setInputs] = useState<MortgageInputs>(() => defaultInputs());

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
        <p className="text-[12px] text-(--color-text-secondary) mb-5">
          Nothing here is saved. Change anything and the numbers update immediately.
        </p>

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
