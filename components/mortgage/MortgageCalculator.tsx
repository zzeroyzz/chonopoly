"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/shell/AppShell";
import { loadProfile } from "@/lib/supabase/profile";
import { clearInputs } from "@/lib/mortgage/storage";
import { CalculatorCore } from "./CalculatorCore";
import { ScenarioBar } from "./ScenarioBar";

/**
 * The free calculator at /tools/mortgage.
 *
 * Nothing is required of you here: no address, no house, no save. It is quick
 * math. Saving is optional and, when you do, you pick a house that already
 * exists — properties are created in one place, Add, and nowhere else.
 *
 * Running the numbers *on* a house happens in NumbersModal, over that house's
 * own page, where the binding is the page's property_id. Both render the same
 * CalculatorCore, so there is one calculator and not two.
 */
export default function MortgageCalculator() {
  const router = useRouter();

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

  // Bumped to remount the core, which is how Reset discards the draft without
  // the core needing to expose an imperative handle for one button.
  const [resetKey, setResetKey] = useState(0);

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
            Quick math — nothing to fill in but the numbers. Your inputs stay put
            between visits.
          </p>
          <button
            type="button"
            onClick={() => {
              clearInputs();
              setResetKey((k) => k + 1);
            }}
            className="text-[12px] text-(--color-text-tertiary) hover:text-(--color-text-primary) transition-colors shrink-0"
          >
            Reset
          </button>
        </div>

        <CalculatorCore
          key={resetKey}
          // Saving is optional here, and it attaches to a house that already
          // exists rather than creating one.
          renderSaveBar={({ inputs, monthlyPayment, onLoad }) => (
            <ScenarioBar inputs={inputs} monthlyPayment={monthlyPayment} onLoad={onLoad} />
          )}
        />
      </div>
    </AppShell>
  );
}
