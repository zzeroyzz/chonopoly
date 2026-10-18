"use client";

import { useCallback, useEffect, useState, useRef } from "react";
import { Save, Trash2, History, RotateCcw, X, AlertCircle, Home, MapPin } from "lucide-react";
import { type MortgageInputs } from "@/lib/mortgage/types";
import {
  type ScenarioProperty,
  type ScenarioSummary,
  type ScenarioVersion,
  diffInputs,
} from "@/lib/mortgage/scenarioService";
import { snapshotChanges } from "@/lib/mortgage/resolveInputs";
import { Card, SectionLabel } from "./fields";
import { dollars } from "./format";

export interface BoundProperty {
  id: string;
  address_line1: string;
  city: string | null;
  state: string | null;
  zip: string | null;
}

interface Props {
  inputs: MortgageInputs;
  monthlyPayment: number;
  /** Replaces the working draft. Only ever called from an explicit click. */
  onLoad: (inputs: MortgageInputs) => void;
  /**
   * The house this calculator was opened from.
   *
   * When set, saving writes straight to that property and the address fields
   * are not shown at all — the house is already known, and asking for it again
   * is what created duplicate property rows. Only the standalone calculator
   * asks for an address.
   */
  boundProperty?: BoundProperty | null;
  /** A scenario to open on arrival, from the Numbers tab's deep link. */
  openScenarioId?: string | null;
}

/** Field names as they read in the UI, for the compare view. */
const FIELD_LABELS: Partial<Record<keyof MortgageInputs, string>> = {
  homeValue: "Sales price",
  downPayment: "Down payment",
  loanType: "Loan type",
  interestRate: "Interest rate",
  termYears: "Term",
  dpaEnabled: "Assistance",
  renovationProgram: "Renovation program",
  renovationBudget: "Renovation cost",
  closingCostPercent: "Closing costs",
  propertyTaxYearly: "Property tax",
  insuranceYearly: "Home insurance",
  hoaMonthly: "HOA",
};

function formatValue(v: unknown): string {
  if (typeof v === "boolean") return v ? "on" : "off";
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : v.toFixed(2);
  if (v === null || v === undefined) return "—";
  return String(v);
}

/**
 * What to tell the user about the house their save landed on.
 *
 * A parcel match is authoritative. An address match is only probable —
 * normalisation is lossy — so it says so rather than implying certainty, and
 * the property carries needs_address_review for a human to confirm or split.
 */
function matchMessage(
  matchedOn: "parcel" | "address" | "created" | undefined,
  property: ScenarioProperty | null | undefined
): string | null {
  if (!matchedOn || !property) return null;
  const where = [property.addressLine1, property.city].filter(Boolean).join(", ");

  if (matchedOn === "parcel") return `Matched ${where} by parcel number.`;
  if (matchedOn === "address") return `Matched ${where} by address — check it before working it.`;
  return `Added ${where} to your properties.`;
}

/** Group scenarios by the house they belong to; unassigned ones come last. */
function groupByProperty(scenarios: ScenarioSummary[]) {
  const houses = new Map<string, { property: ScenarioProperty; rows: ScenarioSummary[] }>();
  const unassigned: ScenarioSummary[] = [];

  for (const s of scenarios) {
    if (!s.property) {
      unassigned.push(s);
      continue;
    }
    const existing = houses.get(s.property.id);
    if (existing) existing.rows.push(s);
    else houses.set(s.property.id, { property: s.property, rows: [s] });
  }

  return { houses: [...houses.values()], unassigned };
}

/** One saved scenario. Extracted from the flat list it replaced, unchanged. */
function ScenarioRow({
  scenario,
  inputs,
  onLoad,
  onHistory,
  onDelete,
}: {
  scenario: ScenarioSummary;
  inputs: MortgageInputs;
  onLoad: () => void;
  onHistory: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-center gap-2 py-2 border-b border-(--color-border-subtle) last:border-0">
      <button type="button" onClick={onLoad} className="flex-1 min-w-0 text-left">
        <span className="block text-[13px] text-(--color-text-primary) truncate">
          {scenario.label}
        </span>
        <span className="block text-[11px] text-(--color-text-tertiary)">
          {dollars(scenario.homeValue, 0)} · {dollars(scenario.monthlyPayment, 0)}/mo
          {scenario.version > 1 && <> · v{scenario.version}</>}
        </span>
        {/* Nothing re-runs on its own. The old verdict stays traceable to the
            numbers behind it until you ask for a new one. */}
        {snapshotChanges(scenario.profileSnapshot, inputs).length > 0 && (
          <span
            data-testid="numbers-changed"
            className="inline-flex items-center gap-1 text-[11px] text-(--color-warning) mt-0.5"
          >
            <AlertCircle size={11} />
            Your numbers changed since this ran
          </span>
        )}
      </button>
      {scenario.version > 1 && (
        <button
          type="button"
          onClick={onHistory}
          aria-label={`History for ${scenario.label}`}
          className="text-(--color-text-tertiary) hover:text-(--color-text-primary) transition-colors shrink-0 p-1"
        >
          <History size={14} />
        </button>
      )}
      <button
        type="button"
        onClick={onDelete}
        aria-label={`Delete ${scenario.label}`}
        className="text-(--color-text-tertiary) hover:text-(--color-danger) transition-colors shrink-0 p-1"
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}

/**
 * Attach a house to a save that never had one.
 *
 * The same upsertProperty path a new save uses, so an address already in the
 * pipeline is matched rather than duplicated.
 */
function AttachAddressForm({
  scenario,
  onDone,
  onCancel,
}: {
  scenario: ScenarioSummary;
  onDone: (note: string | null) => void | Promise<void>;
  onCancel: () => void;
}) {
  // Pre-filled from the label: these were saved under the address, which is
  // exactly the string being asked for.
  const [line1, setLine1] = useState(scenario.label);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!line1.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/mortgage/scenarios/${scenario.id}/address`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address_line1: line1.trim(), context_type: "personal" }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "Could not attach that address");
      }
      const body = (await res.json()) as {
        scenario: ScenarioSummary;
        matchedOn?: "parcel" | "address" | "created";
      };
      await onDone(matchMessage(body.matchedOn, body.scenario.property));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not attach that address");
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 pt-3 border-t border-(--color-border-strong)">
      <p className="text-[11px] uppercase tracking-[0.1em] text-(--color-text-tertiary) mb-2">
        Address for “{scenario.label}”
      </p>
      <input
        type="text"
        value={line1}
        onChange={(e) => setLine1(e.target.value)}
        aria-label="Address to attach"
        data-testid="attach-address-input"
        className="w-full h-9 rounded-[var(--radius-md)] bg-(--color-elevated) border border-(--color-border-default) px-3 text-[13px] text-(--color-text-primary) focus:outline-none focus:border-(--color-accent) transition-colors"
      />
      {error && <p className="text-[11px] text-(--color-danger) mt-1.5">{error}</p>}
      <div className="flex items-center gap-2 mt-2">
        <button
          type="button"
          onClick={() => void submit()}
          disabled={!line1.trim() || busy}
          data-testid="attach-address-save"
          className="h-9 px-3 rounded-[var(--radius-pill)] bg-(--color-accent) text-(--color-base) text-[13px] font-semibold disabled:opacity-40"
        >
          {busy ? "Attaching…" : "Attach"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="text-[12px] text-(--color-text-secondary)"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

export function ScenarioBar({
  inputs,
  monthlyPayment,
  onLoad,
  boundProperty = null,
  openScenarioId = null,
}: Props) {
  const [scenarios, setScenarios] = useState<ScenarioSummary[]>([]);
  const [label, setLabel] = useState("");
  // The house. Optional — quick math still works with no address, and those
  // saves land under "Unassigned" with an action to attach one later.
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [zip, setZip] = useState("");
  const [matchNote, setMatchNote] = useState<string | null>(null);
  const [attachingTo, setAttachingTo] = useState<ScenarioSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [historyFor, setHistoryFor] = useState<ScenarioSummary | null>(null);
  const [versions, setVersions] = useState<ScenarioVersion[]>([]);

  // The Numbers tab has linked `?scenario=<id>` since it was written and
  // nothing ever read it, so that link silently opened a blank calculator.
  //
  // A ref rather than state: this is a one-shot latch, nothing renders from it,
  // and setting state in the effect that reads it cascades renders.
  const openedScenario = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/mortgage/scenarios?context_type=personal");
      if (!res.ok) return;
      const body = (await res.json()) as { scenarios: ScenarioSummary[] };
      setScenarios(body.scenarios);
    } catch {
      // A failed list leaves the saved set unknown, not the page broken.
    }
  }, []);

  // Load the saved list once on mount. The rule guards against cascading
  // renders from a synchronous setState; this one happens in the async
  // continuation after the fetch resolves, which is the "subscribe to an
  // external system" case the rule exists to allow. Same shape and same reason
  // as the localStorage restore in MortgageCalculator.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  async function save() {
    if (!label.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/mortgage/scenarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: label.trim(),
          inputs,
          monthly_payment: monthlyPayment,
          // A bound house is sent by id and never re-derived from text. The
          // two are mutually exclusive and the route rejects both together.
          ...(boundProperty
            ? { property_id: boundProperty.id }
            : {
                address: address.trim()
                  ? {
                      address_line1: address.trim(),
                      city: city.trim() || null,
                      zip: zip.trim() || null,
                    }
                  : null,
              }),
          context_type: "personal",
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "Could not save");
      }
      const body = (await res.json()) as {
        scenario: ScenarioSummary;
        matchedOn?: "parcel" | "address" | "created";
      };
      setMatchNote(matchMessage(body.matchedOn, body.scenario.property));
      setLabel("");
      setAddress("");
      setCity("");
      setZip("");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  async function load(id: string) {
    setError(null);
    try {
      const res = await fetch(`/api/mortgage/scenarios/${id}?context_type=personal`);
      if (!res.ok) throw new Error("Could not open that scenario");
      const body = (await res.json()) as { scenario: { inputs: MortgageInputs } };
      onLoad(body.scenario.inputs);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open that scenario");
    }
  }

  // Open the deep-linked scenario once, after the list has loaded. Once only:
  // re-applying it would overwrite edits the user made after arriving.
  useEffect(() => {
    if (!openScenarioId || openedScenario.current) return;
    openedScenario.current = true;
    void load(openScenarioId);
    // `load` is recreated each render; depending on it would re-run this on
    // every render, which the latch above would block but pointlessly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openScenarioId]);

  async function remove(id: string) {
    setError(null);
    try {
      const res = await fetch(`/api/mortgage/scenarios/${id}?context_type=personal`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Could not delete");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete");
    }
  }

  async function openHistory(scenario: ScenarioSummary) {
    setError(null);
    setHistoryFor(scenario);
    setVersions([]);
    try {
      const res = await fetch(
        `/api/mortgage/scenarios/${scenario.id}/versions?context_type=personal`
      );
      if (!res.ok) throw new Error("Could not load history");
      const body = (await res.json()) as { versions: ScenarioVersion[] };
      setVersions(body.versions);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load history");
    }
  }

  async function restore(version: number) {
    if (!historyFor) return;
    setError(null);
    try {
      const res = await fetch(
        `/api/mortgage/scenarios/${historyFor.id}/versions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ version, context_type: "personal" }),
        }
      );
      if (!res.ok) throw new Error("Could not restore");
      await load(historyFor.id);
      setHistoryFor(null);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not restore");
    }
  }

  const control =
    "h-9 rounded-[var(--radius-md)] bg-(--color-elevated) border border-(--color-border-default) " +
    "px-3 text-[13px] text-(--color-text-primary) placeholder-(--color-text-tertiary) " +
    "focus:outline-none focus:border-(--color-accent) transition-colors";

  return (
    <Card>
      <SectionLabel>Saved scenarios</SectionLabel>

      <div className="flex items-center gap-2">
        <input
          type="text"
          value={label}
          data-testid="scenario-label"
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void save();
            }
          }}
          placeholder="Name this scenario"
          aria-label="Scenario name"
          className={`${control} flex-1 min-w-0`}
        />
        <button
          type="button"
          onClick={() => void save()}
          disabled={!label.trim() || busy}
          className="h-9 px-3 rounded-[var(--radius-pill)] bg-(--color-accent) text-(--color-base) text-[13px] font-semibold disabled:opacity-40 transition-opacity shrink-0 inline-flex items-center gap-1.5"
          data-testid="scenario-save"
        >
          <Save size={14} />
          {busy ? "Saving…" : "Save"}
        </button>
      </div>

      {/* The house. Only asked for by the standalone calculator — a bound save
          already knows which house it is for, and asking again is what created
          two property rows for one address. */}
      {!boundProperty && (
      <div className="grid gap-2 mt-2">
        <input
          type="text"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="Street address (optional)"
          aria-label="Street address"
          data-testid="scenario-address"
          className={control}
        />
        {address.trim() !== "" && (
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="City"
              aria-label="City"
              data-testid="scenario-city"
              className={`${control} flex-1 min-w-0`}
            />
            <input
              type="text"
              inputMode="numeric"
              value={zip}
              onChange={(e) => setZip(e.target.value.replace(/\D/g, "").slice(0, 5))}
              placeholder="ZIP"
              aria-label="ZIP"
              data-testid="scenario-zip"
              className={`${control} w-24 shrink-0 font-(--font-mono)`}
            />
          </div>
        )}
      </div>
      )}

      {matchNote && (
        <p data-testid="match-note" className="text-[11px] text-(--color-accent) mt-2 leading-relaxed">
          {matchNote}
        </p>
      )}

      {error && <p className="text-[11px] text-(--color-danger) mt-2">{error}</p>}

      {scenarios.length === 0 ? (
        <p className="text-[11px] text-(--color-text-tertiary) mt-3 leading-relaxed">
          Save the current numbers under a name to come back to them. Saving again under
          the same name keeps the old one in history.
        </p>
      ) : (
        <div className="mt-3">
          {/* Grouped by house. A flat list of ten names across three houses
              reads as ten unrelated rows; grouped, it reads as three houses
              you are deciding between. */}
          {groupByProperty(scenarios).houses.map((group) => (
            <div key={group.property.id} className="mb-3 last:mb-0">
              <div className="flex items-start gap-1.5 pb-1 border-b border-(--color-border-default)">
                <Home size={12} className="text-(--color-text-tertiary) mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <p className="text-[12px] text-(--color-text-primary) truncate">
                    {group.property.addressLine1}
                    {group.property.city && <>, {group.property.city}</>}
                  </p>
                  {group.property.needsAddressReview && (
                    <p
                      data-testid="needs-review"
                      className="text-[10px] text-(--color-warning) leading-relaxed"
                    >
                      Matched by address, not parcel — check it before working it.
                    </p>
                  )}
                </div>
              </div>
              {group.rows.map((s) => (
                <ScenarioRow
                  key={s.id}
                  scenario={s}
                  inputs={inputs}
                  onLoad={() => void load(s.id)}
                  onHistory={() => void openHistory(s)}
                  onDelete={() => void remove(s.id)}
                />
              ))}
            </div>
          ))}

          {groupByProperty(scenarios).unassigned.length > 0 && (
            <div className="mb-3 last:mb-0">
              <div className="flex items-center gap-1.5 pb-1 border-b border-(--color-border-default)">
                <MapPin size={12} className="text-(--color-text-tertiary) shrink-0" />
                <p className="text-[12px] text-(--color-text-secondary)">Unassigned</p>
              </div>
              <p className="text-[10px] text-(--color-text-tertiary) py-1 leading-relaxed">
                Saved before houses were part of the model. Attach an address to put
                one on the pipeline.
              </p>
              {groupByProperty(scenarios).unassigned.map((s) => (
                <div key={s.id}>
                  <ScenarioRow
                    scenario={s}
                    inputs={inputs}
                    onLoad={() => void load(s.id)}
                    onHistory={() => void openHistory(s)}
                    onDelete={() => void remove(s.id)}
                  />
                  <button
                    type="button"
                    onClick={() => setAttachingTo(s)}
                    data-testid={`attach-${s.id}`}
                    className="text-[11px] text-(--color-accent) inline-flex items-center gap-1 pl-1 pb-1.5"
                  >
                    <MapPin size={11} />
                    Attach an address
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {attachingTo && (
        <AttachAddressForm
          scenario={attachingTo}
          onDone={async (note) => {
            setMatchNote(note);
            setAttachingTo(null);
            await refresh();
          }}
          onCancel={() => setAttachingTo(null)}
        />
      )}


      {/* History. Each entry shows what changed when it was replaced, so the
          list answers "which one do I want" without opening each in turn. */}
      {historyFor && (
        <div className="mt-4 pt-3 border-t border-(--color-border-strong)">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] uppercase tracking-[0.1em] text-(--color-text-tertiary)">
              History · {historyFor.label}
            </span>
            <button
              type="button"
              onClick={() => setHistoryFor(null)}
              aria-label="Close history"
              className="text-(--color-text-tertiary) hover:text-(--color-text-primary) p-1"
            >
              <X size={14} />
            </button>
          </div>

          {versions.length === 0 ? (
            <p className="text-[11px] text-(--color-text-tertiary)">No earlier versions.</p>
          ) : (
            versions.map((v, i) => {
              // Compared against what replaced it: the next newer version, or
              // the live scenario when this is the most recent snapshot.
              const newer = i === 0 ? inputs : versions[i - 1].inputs;
              const changes = diffInputs(v.inputs, newer).filter((c) => FIELD_LABELS[c.field]);
              return (
                <div
                  key={v.id}
                  className="py-2 border-b border-(--color-border-subtle) last:border-0"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[12px] text-(--color-text-secondary)">
                      v{v.version} · {dollars(v.monthlyPayment, 0)}/mo
                    </span>
                    <button
                      type="button"
                      onClick={() => void restore(v.version)}
                      className="text-[11px] text-(--color-accent) inline-flex items-center gap-1 shrink-0"
                    >
                      <RotateCcw size={12} />
                      Restore
                    </button>
                  </div>
                  {changes.length > 0 && (
                    <p className="text-[11px] text-(--color-text-tertiary) mt-0.5 leading-relaxed">
                      {changes.slice(0, 3).map((c, n) => (
                        <span key={String(c.field)}>
                          {n > 0 && " · "}
                          {FIELD_LABELS[c.field]} {formatValue(c.from)} → {formatValue(c.to)}
                        </span>
                      ))}
                      {changes.length > 3 && <> · +{changes.length - 3} more</>}
                    </p>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </Card>
  );
}
