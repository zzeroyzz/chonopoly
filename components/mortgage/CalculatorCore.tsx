"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Home } from "lucide-react";
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

/**
 * The calculator itself: inputs, results, and the profile they resolve against.
 *
 * Extracted from MortgageCalculator so two hosts can share it without a second
 * copy — the standalone page wraps it in AppShell, and NumbersModal renders it
 * over a house with its own sticky Save. The host owns its chrome; this owns
 * the numbers.
 */

/** The house this calculator is bound to, when it has one. */
export interface BoundProperty {
  id: string;
  address_line1: string;
  city: string | null;
  state: string | null;
  zip: string | null;
}

export interface CalculatorNumbers {
  inputs: MortgageInputs;
  monthlyPayment: number;
}

export interface CalculatorCoreProps {
  /**
   * The house this is bound to. On the property page it is that page's own
   * property_id, so the binding cannot be re-derived from a typed address —
   * which is what created a second property row for one house.
   */
  propertyId?: string | null;
  /** An existing analysis to open. */
  scenarioId?: string | null;
  /** The live numbers, so a host can save them from its own footer. */
  onNumbersChange?: (numbers: CalculatorNumbers) => void;
  /** Whether the user has edited anything, for an unsaved-changes prompt. */
  onTouchedChange?: (touched: boolean) => void;
  /** The host names the house itself when it has a header of its own. */
  showBoundBanner?: boolean;
  /** Amortization is long; the modal leaves it off to keep Save reachable. */
  showAmortization?: boolean;
  /**
   * The saved-scenario bar, rendered in the results column.
   *
   * A render prop rather than `children` because it needs the live numbers and
   * a way to put a loaded scenario back into the draft — and those live here.
   */
  renderSaveBar?: (api: {
    inputs: MortgageInputs;
    monthlyPayment: number;
    onLoad: (loaded: MortgageInputs) => void;
  }) => React.ReactNode;
}

export function CalculatorCore({
  propertyId = null,
  scenarioId = null,
  onNumbersChange,
  onTouchedChange,
  showBoundBanner = false,
  showAmortization = true,
  renderSaveBar,
}: CalculatorCoreProps) {
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
  // markup on the server and the client and break hydration.
  useEffect(() => {
    // The house's key, so one house's draft never surfaces on another.
    draftExisted.current = hasDraft(propertyId);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setInputs(loadInputs(propertyId));
    setRestored(true);
  }, [propertyId]);

  useEffect(() => {
    if (restored) saveInputs(inputs, propertyId);
  }, [inputs, restored, propertyId]);

  // ── The bound house, and the seed it supplies ─────────────────────────────
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
        // cannot name the house it is saving to.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [propertyId, scenarioId]);

  // An existing analysis, opened by id. Once only: re-applying it would
  // overwrite edits made after arriving.
  const openedScenario = useRef(false);
  useEffect(() => {
    if (!scenarioId || openedScenario.current) return;
    openedScenario.current = true;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/mortgage/scenarios/${scenarioId}?context_type=personal`);
        if (!res.ok) return;
        const body = (await res.json()) as { scenario: { inputs: MortgageInputs } };
        if (!cancelled) setInputs(body.scenario.inputs);
      } catch {
        // The calculator still works; it just opens on the defaults.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [scenarioId]);

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

  // Only a user edit counts as touched. The draft restore and the house prefill
  // both move `inputs` without anyone typing, and treating those as changes
  // would make Cancel ask about work nobody did.
  const patch = (p: Partial<MortgageInputs>) => {
    setInputs((prev) => ({ ...prev, ...p }));
    onTouchedChange?.(true);
  };

  // The three sources merged. `inputs` holds the house-shaped draft; the
  // profile supplies income, debts and the loan defaults.
  const resolved = useMemo(
    () => resolveInputs(profileState.kind === "ready" ? profileState.profile : null, inputs),
    [profileState, inputs]
  );

  const result = useMemo(() => calculateMortgage(resolved), [resolved]);
  const affordability = useMemo(() => calculateAffordability(resolved), [resolved]);
  // Your actual ratios and whether they clear. Computed once here so the panel
  // displays the same verdict the module calculates.
  const dti = useMemo(() => calculateDti(resolved, result), [resolved, result]);
  const required = useMemo(
    () => calculateRequiredIncome(resolved, result.totalMonthlyWithMortgageInsurance),
    [resolved, result.totalMonthlyWithMortgageInsurance]
  );

  const monthlyPayment = result.totalMonthlyWithMortgageInsurance;

  // Reported upward so the host's Save sends the same figures on screen.
  useEffect(() => {
    onNumbersChange?.({ inputs: resolved, monthlyPayment });
    // onNumbersChange is recreated by most parents on every render; depending
    // on it would loop. The numbers are the dependency that matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolved, monthlyPayment]);

  return (
    <>
      {showBoundBanner && boundProperty && (
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
                    // Reads the draft, not `resolved`, which is what the code
                    // being extracted here did. The draft's income is always 0
                    // — storage strips it and defaultInputs zeroes it — so this
                    // renders $0 beside a required figure built from the real
                    // profile. Preserved rather than corrected: a refactor
                    // about binding must not quietly change a verdict on
                    // screen. Reported as a follow-up.
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
          {renderSaveBar?.({ inputs: resolved, monthlyPayment, onLoad: setInputs })}
          <RateLookup />
        </div>
      </div>

      {showAmortization && (
        <div className="mt-4">
          <AmortizationSection result={result} />
        </div>
      )}

      {showIncomeModal && (
        <FirstRunIncomeModal
          onCreated={(profile) => {
            setProfileState({ kind: "ready", profile });
            setShowIncomeModal(false);
          }}
          onClose={() => setShowIncomeModal(false)}
        />
      )}
    </>
  );
}

/** Clears this house's draft. Exposed so a host's Reset can use it. */
export function resetDraft(propertyId?: string | null): MortgageInputs {
  clearInputs(propertyId);
  return defaultInputs();
}
