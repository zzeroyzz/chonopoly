"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Home } from "lucide-react";
import { AppShell } from "@/components/shell/AppShell";
import { loadProfile } from "@/lib/supabase/profile";
import { useEffect } from "react";
import { type MortgageInputs } from "@/lib/mortgage/types";
import { loadInputs, saveInputs, clearInputs, hasDraft } from "@/lib/mortgage/storage";
import { defaultInputs } from "@/lib/mortgage/defaults";
import { calculateMortgage } from "@/lib/mortgage/calculate";
import { calculateAffordability, calculateRequiredIncome } from "@/lib/mortgage/affordability";
import { calculateDti } from "@/lib/mortgage/dti";
import { resolveInputs, housePrefill, type HouseFacts } from "@/lib/mortgage/resolveInputs";
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

interface Props {
  /**
   * The house this calculator is bound to, taken from the route by
   * `/properties/[id]/numbers/*`. The UUID in the path IS the binding, so it
   * survives a reload and cannot be lost by a navigation.
   */
  propertyId?: string | null;
  /** An existing analysis to open, from `/numbers/[analysisId]`. */
  scenarioId?: string | null;
}

export default function MortgageCalculator({
  propertyId: routePropertyId = null,
  scenarioId: routeScenarioId = null,
}: Props = {}) {
  const router = useRouter();

  // ── The house, when the calculator was opened from one ────────────────────
  //
  // Previously there was no binding at all: the Numbers tab told the user to
  // "run the numbers in the mortgage calculator and save with this address",
  // which meant retyping an address that was already on file. Two slightly
  // different spellings hashed differently and produced two property rows for
  // one house, which is the bug this exists to close.
  //
  // The route-keyed pages pass the binding as props, so there is no query
  // string to read and nothing to suspend on. Only `/tools/mortgage` still
  // reads it from the URL, and it reads window.location rather than
  // useSearchParams deliberately: useSearchParams suspends, and AppShell —
  // which carries the bottom nav — renders inside this component. Suspending
  // took the whole nav off screen during a client-side navigation, so Tools
  // became a route you could enter and not leave. Caught by 22-navigation.
  const [binding, setBinding] = useState<{
    property: string | null;
    scenario: string | null;
  } | null>(routePropertyId ? { property: routePropertyId, scenario: routeScenarioId } : null);

  useEffect(() => {
    if (routePropertyId) return;
    const params = new URLSearchParams(window.location.search);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBinding({ property: params.get("property"), scenario: params.get("scenario") });
  }, [routePropertyId]);

  const propertyId = binding?.property ?? null;
  const scenarioId = binding?.scenario ?? null;
  // Null until the standalone page has read the query string. The draft cannot
  // load before this: reading the global key first and the house's key second
  // would briefly show one house's work on another.
  const bindingResolved = binding !== null;

  const [boundProperty, setBoundProperty] = useState<BoundProperty | null>(null);

  // One serializable object rather than a field per useState — which is what
  // makes persisting the whole thing a one-liner.
  const [inputs, setInputs] = useState<MortgageInputs>(() => defaultInputs());
  const [restored, setRestored] = useState(false);

  // Whether a draft already existed for this house, captured by the restore
  // below before the save effect can write one. Without it, the restore writes
  // a draft and the prefill then sees its own handiwork and skips.
  const draftExisted = useRef<boolean | null>(null);
  const prefilled = useRef(false);

  // Read on mount rather than in the initializer. localStorage doesn't exist
  // during the server render, so initializing from it would render different
  // markup on the server and the client and break hydration. One setState on
  // mount is the accepted cost of that; the rule below is about cascading
  // renders, and this fires exactly once.
  useEffect(() => {
    // The house's key, so one house's draft never surfaces on another.
    if (!bindingResolved) return;
    draftExisted.current = hasDraft(propertyId);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setInputs(loadInputs(propertyId));
    setRestored(true);
  }, [bindingResolved, propertyId]);

  useEffect(() => {
    if (restored) saveInputs(inputs, propertyId);
  }, [inputs, restored, propertyId]);

  // ── The bound house, and the seed it supplies ─────────────────────────────
  //
  // Declared after `inputs` deliberately: it patches the draft, so it cannot
  // run before the state it writes to exists.
  useEffect(() => {
    if (!propertyId) return;
    let cancelled = false;
    (async () => {
      try {
        // Independent reads, so they go together rather than in sequence.
        const [propertyRes, listRes] = await Promise.all([
          fetch(`/api/properties/${propertyId}?context_type=personal`),
          fetch(`/api/mortgage/scenarios?context_type=personal&property_id=${propertyId}`),
        ]);

        if (!propertyRes.ok) return;
        const { property } = (await propertyRes.json()) as {
          property: BoundProperty & HouseFacts;
        };
        if (cancelled) return;
        setBoundProperty(property);

        // Seed a new analysis from the house. Not when opening an existing one
        // — that supplies its own inputs — and not over a draft in progress.
        if (scenarioId || prefilled.current || draftExisted.current !== false) return;
        prefilled.current = true;

        let primaryInputs: MortgageInputs | null = null;
        if (listRes.ok) {
          const { scenarios } = (await listRes.json()) as {
            scenarios: { id: string; isPrimary?: boolean }[];
          };
          // The primary is the one the other tabs mean by "the price".
          const primary = scenarios.find((s) => s.isPrimary);
          if (primary) {
            const res = await fetch(`/api/mortgage/scenarios/${primary.id}?context_type=personal`);
            if (res.ok) {
              const body = (await res.json()) as { scenario: { inputs: MortgageInputs } };
              primaryInputs = body.scenario.inputs;
            }
          }
        }

        if (cancelled) return;
        const seed = housePrefill(property, primaryInputs);
        if (Object.keys(seed).length > 0) setInputs((prev) => ({ ...prev, ...seed }));
      } catch {
        // Unbound rather than broken: the calculator still works, it just
        // saves under "Unassigned" instead of onto the house.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [propertyId, scenarioId]);

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
              // This house's draft only. Resetting the calculator on one house
              // must not wipe what you were modelling on another.
              clearInputs(propertyId);
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
