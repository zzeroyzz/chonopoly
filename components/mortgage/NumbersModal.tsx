"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { type MortgageInputs } from "@/lib/mortgage/types";
import { saveAnalysis } from "@/lib/mortgage/scenarioClient";
import { CalculatorCore, type CalculatorNumbers } from "./CalculatorCore";
import { suggestScenarioName } from "@/lib/mortgage/scenarioName";

/**
 * Running the numbers on a house, over the house's own page.
 *
 * A modal rather than a route: the house is already on screen, and the binding
 * is that page's property_id. Nothing re-derives it from an address, so there
 * is no second spelling to hash differently and no second property row.
 *
 * Which analysis is open lives in the URL (`?numbers=new` or
 * `?numbers=<analysisId>`), so a reload comes back to the same house with the
 * same analysis open.
 */

export interface NumbersModalProps {
  /** The house. Comes from the page, never from typed text. */
  propertyId: string;
  /** Its address, for the header. */
  heading: string;
  /** "new", or an existing analysis id. */
  target: "new" | string;
  /** The label to open with, when editing an analysis that already has one. */
  initialLabel?: string;
  onClose: () => void;
  /** Saved: the host closes, refreshes the Numbers tab and the verdicts. */
  onSaved: () => void;
}

export function NumbersModal({
  propertyId,
  heading,
  target,
  initialLabel = "",
  onClose,
  onSaved,
}: NumbersModalProps) {
  const isNew = target === "new";
  const [label, setLabel] = useState(initialLabel);
  const [numbers, setNumbers] = useState<CalculatorNumbers | null>(null);
  /** The name offered once the loan is known. Suggested, never imposed. */
  const [nameTouched, setNameTouched] = useState(false);
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingClose, setConfirmingClose] = useState(false);

  // A name that describes the scenario rather than the house, offered as soon
  // as the loan is known. Only while the user has not typed their own: a name
  // somebody picked is not ours to overwrite.
  useEffect(() => {
    if (!isNew || nameTouched || !numbers) return;
    const suggested = suggestScenarioName(numbers.inputs);
    setLabel((current) => (current.trim() === "" ? suggested : current));
  }, [isNew, nameTouched, numbers]);

  // Escape closes, through the same guard as Cancel.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") requestClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // requestClose closes over `touched`, which is the dependency that matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [touched]);

  // The page behind must not scroll while the modal owns the screen.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  function requestClose() {
    // Losing a model you have been building because you tapped outside it is
    // the kind of thing you only forgive once.
    if (touched) {
      setConfirmingClose(true);
      return;
    }
    onClose();
  }

  async function save() {
    if (!numbers || busy) return;
    if (!label.trim()) {
      setError("Give this analysis a name");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await saveAnalysis({
        label,
        inputs: numbers.inputs,
        monthlyPayment: numbers.monthlyPayment,
        // The house this modal was opened over. No address, ever.
        propertyId,
      });
      setTouched(false);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      data-testid="numbers-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={`Run the numbers on ${heading}`}
    >
      {/* Backdrop. Tapping it goes through the unsaved-changes guard. */}
      <button
        type="button"
        aria-label="Close"
        onClick={requestClose}
        className="absolute inset-0 bg-black/60"
      />

      {/*
        A column with three rows: a fixed header, a scrolling body, and a
        footer that stays put. min-h-0 on the body is what lets it scroll
        inside the modal instead of pushing the footer off a 390px screen.
      */}
      <div className="relative flex flex-col w-full h-full sm:h-auto sm:max-h-[90vh] sm:max-w-3xl bg-(--color-surface) sm:rounded-xl border border-(--color-border-default) overflow-hidden">
        <div className="flex items-start gap-3 px-4 py-3 border-b border-(--color-border-subtle) shrink-0">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] uppercase tracking-widest text-(--color-text-tertiary)">
              {isNew ? "New analysis" : "Analysis"}
            </p>
            {/* The house it is bound to, named where the eye lands first. */}
            <p
              data-testid="numbers-modal-house"
              className="text-[14px] font-semibold text-(--color-text-primary) wrap-break-word"
            >
              {heading}
            </p>
          </div>
          <button
            type="button"
            onClick={requestClose}
            data-testid="numbers-close"
            aria-label="Close"
            className="shrink-0 p-1 text-(--color-text-tertiary) hover:text-(--color-text-primary) transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4">
          <CalculatorCore
            propertyId={propertyId}
            scenarioId={isNew ? null : target}
            onNumbersChange={setNumbers}
            onTouchedChange={setTouched}
            // The header already names the house, and amortization is long
            // enough to bury the footer on a phone.
            showBoundBanner={false}
            showAmortization={false}
          />
        </div>

        <div className="shrink-0 border-t border-(--color-border-subtle) bg-(--color-surface) px-4 py-3">
          {error && (
            <p data-testid="numbers-error" className="text-[11px] text-(--color-danger) mb-2">
              {error}
            </p>
          )}
          <label className="block mb-2">
            <span className="block text-[10px] uppercase tracking-widest text-(--color-text-tertiary) mb-1">
              Name
            </span>
            <input
              value={label}
              onChange={(e) => {
                setLabel(e.target.value);
                setNameTouched(true);
                setTouched(true);
              }}
              placeholder="at asking"
              data-testid="numbers-label"
              className="w-full h-10 rounded-md bg-(--color-elevated) border border-(--color-border-default) px-3 text-[14px] text-(--color-text-primary) focus:outline-none focus:border-(--color-accent) transition-colors"
            />
          </label>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={requestClose}
              data-testid="numbers-cancel"
              className="h-10 px-4 rounded-md border border-(--color-border-default) text-[13px] text-(--color-text-secondary) hover:text-(--color-text-primary) transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void save()}
              disabled={busy || !numbers}
              data-testid="numbers-save"
              className="flex-1 h-10 rounded-md bg-(--color-accent) text-[13px] font-medium text-(--color-on-accent) disabled:opacity-50 transition-opacity"
            >
              {busy ? "Saving…" : isNew ? "Save analysis" : "Save new version"}
            </button>
          </div>
        </div>
      </div>

      {confirmingClose && (
        <div
          data-testid="numbers-confirm-close"
          className="absolute inset-0 z-10 flex items-center justify-center p-6"
        >
          <div className="absolute inset-0 bg-black/60" />
          <div className="relative w-full max-w-xs rounded-xl border border-(--color-border-default) bg-(--color-surface) p-4">
            <p className="text-[13px] font-medium text-(--color-text-primary) mb-1">
              Discard this analysis?
            </p>
            <p className="text-[12px] text-(--color-text-secondary) mb-4">
              You have unsaved changes on {heading}.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmingClose(false)}
                data-testid="numbers-keep-editing"
                className="flex-1 h-9 rounded-md border border-(--color-border-default) text-[12px] text-(--color-text-secondary)"
              >
                Keep editing
              </button>
              <button
                type="button"
                onClick={onClose}
                data-testid="numbers-discard"
                className="flex-1 h-9 rounded-md bg-(--color-danger) text-[12px] font-medium text-white"
              >
                Discard
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Re-exported so hosts can type the numbers they receive. */
export type { MortgageInputs };
