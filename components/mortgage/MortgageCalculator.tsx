"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Home } from "lucide-react";
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

/** The house this calculator is bound to, when it was opened from one. */
interface BoundProperty {
  id: string;
  address_line1: string;
  city: string | null;
  state: string | null;
  zip: string | null;
}

export default function MortgageCalculator() {
  const router = useRouter();

  // ── The house, when the calculator was opened from one ────────────────────
  //
  // Previously there was no binding at all: the Numbers tab told the user to
  // "run the numbers in the mortgage calculator and save with this address",
  // which meant retyping an address that was already on file. Two slightly
  // different spellings hashed differently and produced two property rows for
  // one house, which is the bug this exists to close.
  // Read from window.location rather than useSearchParams, deliberately.
  //
  // useSearchParams suspends, and AppShell — which carries the bottom nav — is
  // rendered inside this component. Suspending took the whole nav off screen
  // during a client-side navigation into this page, so Tools became a route
  // you could enter and not leave. Caught by 22-navigation.
  const [propertyId, setPropertyId] = useState<string | null>(null);
  const [scenarioId, setScenarioId] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPropertyId(params.get("property"));
    setScenarioId(params.get("scenario"));
  }, []);

  const [boundProperty, setBoundProperty] = useState<BoundProperty | null>(null);

  useEffect(() => {
    if (!propertyId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/properties/${propertyId}?context_type=personal`);
        if (!res.ok) return;
        const body = (await res.json()) as { property: BoundProperty };
        if (!cancelled) setBoundProperty(body.property);
      } catch {
        // Unbound rather than broken: the calculator still works, it just
        // saves under "Unassigned" instead of onto the house.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [propertyId]);

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
        {/* Which house this is for, stated at the top. Without it there is no
            way to tell a bound calculator from the standalone one, and the
            save behaves differently in each. */}
        {boundProperty && (
          <div
            data-testid="bound-property"
            className="flex items-start gap-2 rounded-lg border border-(--color-accent) bg-(--color-accent-glow) px-3 py-2 mb-4"
          >
            <Home size={13} className="shrink-0 mt-0.5 text-(--color-accent)" />
            <div className="min-w-0">
              <p className="text-[12px] font-medium text-(--color-text-primary) wrap-break-word">
                {boundProperty.address_line1}
              </p>
              <p className="text-[11px] text-(--color-text-secondary)">
                {[boundProperty.city, boundProperty.state, boundProperty.zip]
                  .filter(Boolean)
                  .join(", ")}
                {" · saves to this house"}
              </p>
            </div>
          </div>
        )}

        <div className="flex items-baseline justify-between gap-4 mb-5">
          <p className="text-[12px] text-(--color-text-secondary)">
            {boundProperty
              ? "Saving keeps this analysis on the house above."
              : "Your inputs stay put between visits. Save a scenario to keep it on your account."}
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
              boundProperty={boundProperty}
              openScenarioId={scenarioId}
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
