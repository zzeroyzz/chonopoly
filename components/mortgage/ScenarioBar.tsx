"use client";

import { useCallback, useEffect, useState } from "react";
import { Save, Trash2, History, RotateCcw, X } from "lucide-react";
import { type MortgageInputs } from "@/lib/mortgage/types";
import {
  type ScenarioSummary,
  type ScenarioVersion,
  diffInputs,
} from "@/lib/mortgage/scenarioService";
import { Card, SectionLabel } from "./fields";
import { dollars } from "./format";

interface Props {
  inputs: MortgageInputs;
  monthlyPayment: number;
  /** Replaces the working draft. Only ever called from an explicit click. */
  onLoad: (inputs: MortgageInputs) => void;
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
  grossMonthlyIncome: "Gross monthly income",
  otherMonthlyDebt: "Other monthly debt",
};

function formatValue(v: unknown): string {
  if (typeof v === "boolean") return v ? "on" : "off";
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : v.toFixed(2);
  if (v === null || v === undefined) return "—";
  return String(v);
}

export function ScenarioBar({ inputs, monthlyPayment, onLoad }: Props) {
  const [scenarios, setScenarios] = useState<ScenarioSummary[]>([]);
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [historyFor, setHistoryFor] = useState<ScenarioSummary | null>(null);
  const [versions, setVersions] = useState<ScenarioVersion[]>([]);

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
          context_type: "personal",
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "Could not save");
      }
      setLabel("");
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
        >
          <Save size={14} />
          {busy ? "Saving…" : "Save"}
        </button>
      </div>

      {error && <p className="text-[11px] text-(--color-danger) mt-2">{error}</p>}

      {scenarios.length === 0 ? (
        <p className="text-[11px] text-(--color-text-tertiary) mt-3 leading-relaxed">
          Save the current numbers under a name to come back to them. Saving again under
          the same name keeps the old one in history.
        </p>
      ) : (
        <div className="mt-3">
          {scenarios.map((s) => (
            <div
              key={s.id}
              className="flex items-center gap-2 py-2 border-b border-(--color-border-subtle) last:border-0"
            >
              <button
                type="button"
                onClick={() => void load(s.id)}
                className="flex-1 min-w-0 text-left"
              >
                <span className="block text-[13px] text-(--color-text-primary) truncate">
                  {s.label}
                </span>
                <span className="block text-[11px] text-(--color-text-tertiary)">
                  {dollars(s.homeValue, 0)} · {dollars(s.monthlyPayment, 0)}/mo
                  {s.version > 1 && <> · v{s.version}</>}
                </span>
              </button>
              {s.version > 1 && (
                <button
                  type="button"
                  onClick={() => void openHistory(s)}
                  aria-label={`History for ${s.label}`}
                  className="text-(--color-text-tertiary) hover:text-(--color-text-primary) transition-colors shrink-0 p-1"
                >
                  <History size={14} />
                </button>
              )}
              <button
                type="button"
                onClick={() => void remove(s.id)}
                aria-label={`Delete ${s.label}`}
                className="text-(--color-text-tertiary) hover:text-(--color-danger) transition-colors shrink-0 p-1"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
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
