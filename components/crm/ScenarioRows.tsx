"use client";

import { useState } from "react";
import { Check, History, Pencil, Star } from "lucide-react";
import { type ScenarioSummary, type ScenarioVersion } from "@/lib/mortgage/scenarioService";
import { type BuyerProfile } from "@/lib/profile/types";
import { resolveInputs } from "@/lib/mortgage/resolveInputs";
import { calculateMortgage } from "@/lib/mortgage/calculate";
import { buildDeal, holdingFrom } from "@/lib/deal/buildDeal";
import { resolveRehab } from "@/lib/rehab/resolveRehab";
import { taxDefaultsFrom } from "@/lib/mortgage/capitalGains";
import { scenarioDescription, suggestScenarioName } from "@/lib/mortgage/scenarioName";
import { DPA_AWARD } from "@/lib/mortgage/loanTypes";
import { dollars } from "@/components/mortgage/format";

/**
 * The scenarios on a house, costed side by side.
 *
 * The list used to be a name, a price and a payment, with the primary marked
 * by a word and settable only by being saved first. That left two questions
 * unanswerable from the screen: which scenario the profit figures come from,
 * and how to change it. Both are answered here — every row carries its own
 * walk-away and true profit, so the scenarios can be compared at a glance, and
 * any row can be promoted in one tap.
 */

interface Props {
  scenarios: ScenarioSummary[];
  profile: BuyerProfile | null;
  arv: number | null;
  state: string | null;
  ctxParams: string;
  onOpen: (id: string) => void;
  /** After a promotion or a rename, so the page and the Profit card re-read. */
  onChanged: () => void | Promise<void>;
}

/** One row's own deal, from its own stored inputs. */
function dealFor(
  scenario: ScenarioSummary,
  profile: BuyerProfile | null,
  arv: number | null,
  state: string | null
) {
  const inputs = resolveInputs(profile, scenario.inputs);
  const result = calculateMortgage(inputs);
  return buildDeal({
    inputs,
    result,
    arv,
    rehab: resolveRehab(null, inputs.renovationBudget),
    sellerClosingPct: profile?.defaults.sellingPct ?? 8,
    holding: holdingFrom(profile?.defaults),
    taxes: taxDefaultsFrom(profile?.defaults),
    state,
  });
}

export function ScenarioRows({
  scenarios,
  profile,
  arv,
  state,
  ctxParams,
  onOpen,
  onChanged,
}: Props) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [historyFor, setHistoryFor] = useState<ScenarioSummary | null>(null);
  const [versions, setVersions] = useState<ScenarioVersion[]>([]);

  async function patch(id: string, body: Record<string, unknown>) {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/mortgage/scenarios/${id}?${ctxParams}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, context_type: "personal" }),
      });
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(b.error ?? "That did not work");
      }
      await onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That did not work");
    } finally {
      setBusyId(null);
    }
  }

  async function openHistory(scenario: ScenarioSummary) {
    setHistoryFor(scenario);
    setVersions([]);
    try {
      const res = await fetch(`/api/mortgage/scenarios/${scenario.id}/versions?${ctxParams}`);
      if (!res.ok) return;
      const body = (await res.json()) as { versions: ScenarioVersion[] };
      setVersions(body.versions);
    } catch {
      // An empty history is a worse answer than none, but not a broken page.
    }
  }

  async function restore(version: number) {
    if (!historyFor) return;
    setBusyId(historyFor.id);
    try {
      const res = await fetch(`/api/mortgage/scenarios/${historyFor.id}/versions?${ctxParams}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version, context_type: "personal" }),
      });
      if (!res.ok) throw new Error("Could not restore that version");
      setHistoryFor(null);
      await onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not restore that version");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="grid gap-2">
      {error && <p className="text-[11px] text-(--color-danger)">{error}</p>}

      {scenarios.map((s) => {
        const built = dealFor(s, profile, arv, state);
        const deal = built.result;
        const suggestion = suggestScenarioName(s.inputs);
        const nameIsStale = s.label.trim() !== suggestion && /\d{2,}|,/.test(s.label);

        return (
          <div
            key={s.id}
            data-testid={`scenario-${s.id}`}
            data-primary={s.isPrimary ? "yes" : "no"}
            className={`rounded-lg border p-3 ${
              s.isPrimary
                ? "border-(--color-accent) bg-(--color-accent-glow)"
                : "border-(--color-border-default)"
            }`}
          >
            <div className="flex items-start gap-2">
              <button
                type="button"
                onClick={() => onOpen(s.id)}
                className="flex-1 min-w-0 text-left"
              >
                <span className="block text-[13px] font-medium text-(--color-text-primary) truncate">
                  {s.label}
                </span>
                {/* What makes this scenario different from the one above it. */}
                <span className="block text-[11px] text-(--color-text-secondary) truncate">
                  {scenarioDescription(s.inputs, DPA_AWARD)}
                </span>
              </button>

              {s.isPrimary ? (
                <span
                  data-testid={`primary-badge-${s.id}`}
                  className="shrink-0 inline-flex items-center gap-1 text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-(--color-accent) text-(--color-base) font-semibold"
                >
                  <Star size={10} /> Used for profit
                </span>
              ) : (
                <button
                  type="button"
                  disabled={busyId === s.id}
                  onClick={() => void patch(s.id, { is_primary: true })}
                  data-testid={`make-primary-${s.id}`}
                  className="shrink-0 text-[11px] text-(--color-accent) border border-(--color-accent) rounded px-2 py-0.5 disabled:opacity-40"
                >
                  {busyId === s.id ? "…" : "Make primary"}
                </button>
              )}
            </div>

            {/* Price and payment, then what the scenario actually makes. */}
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1 mt-2.5 text-[11px]">
              <Figure label="Price" value={dollars(s.homeValue, 0)} />
              <Figure label="Payment" value={`${dollars(s.monthlyPayment, 0)}/mo`} />
              <Figure
                label="Walk-away"
                value={deal.walkAwayCash === null ? "—" : dollars(deal.walkAwayCash, 0)}
                accent
              />
              <Figure
                label="True profit"
                value={deal.trueProfit === null ? "—" : dollars(deal.trueProfit, 0)}
                negative={deal.trueProfit !== null && deal.trueProfit < 0}
              />
            </dl>

            <div className="flex items-center gap-3 mt-2.5">
              {/* "v2" said nothing about what it was. */}
              {s.version > 1 ? (
                <button
                  type="button"
                  onClick={() => void openHistory(s)}
                  data-testid={`history-${s.id}`}
                  className="inline-flex items-center gap-1 text-[11px] text-(--color-text-secondary) hover:text-(--color-text-primary)"
                >
                  <History size={11} />
                  Saved {s.version} times · History
                </button>
              ) : (
                <span className="text-[11px] text-(--color-text-tertiary)">Saved once</span>
              )}

              {renaming === s.id ? (
                <span className="flex items-center gap-1.5 flex-1 min-w-0">
                  <input
                    autoFocus
                    value={draftName}
                    onChange={(e) => setDraftName(e.target.value)}
                    aria-label={`Rename ${s.label}`}
                    data-testid={`rename-input-${s.id}`}
                    className="flex-1 min-w-0 h-7 rounded-md bg-(--color-elevated) border border-(--color-accent) px-2 text-[12px] text-(--color-text-primary) focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={async () => {
                      await patch(s.id, { label: draftName });
                      setRenaming(null);
                    }}
                    aria-label="Save the name"
                    className="shrink-0 text-(--color-accent) p-1"
                  >
                    <Check size={13} />
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setRenaming(s.id);
                    setDraftName(nameIsStale ? suggestion : s.label);
                  }}
                  data-testid={`rename-${s.id}`}
                  className="inline-flex items-center gap-1 text-[11px] text-(--color-text-tertiary) hover:text-(--color-text-primary)"
                >
                  <Pencil size={11} />
                  Rename
                </button>
              )}
            </div>

            {/* Offered, never applied on its own. A name somebody picked is not
                ours to overwrite. */}
            {nameIsStale && renaming !== s.id && (
              <p className="text-[11px] text-(--color-text-tertiary) mt-1.5 leading-relaxed">
                Named after the house.{" "}
                <button
                  type="button"
                  onClick={() => void patch(s.id, { label: suggestion })}
                  data-testid={`rename-suggest-${s.id}`}
                  className="text-(--color-accent)"
                >
                  Call it &ldquo;{suggestion}&rdquo;
                </button>
              </p>
            )}
          </div>
        );
      })}

      {historyFor && (
        <div
          data-testid="scenario-history"
          className="rounded-lg border border-(--color-border-strong) p-3"
        >
          <div className="flex items-baseline justify-between gap-2 mb-2">
            <p className="text-[12px] font-medium text-(--color-text-primary) truncate">
              {historyFor.label} · history
            </p>
            <button
              type="button"
              onClick={() => setHistoryFor(null)}
              className="text-[11px] text-(--color-text-tertiary)"
            >
              Close
            </button>
          </div>
          {versions.length === 0 ? (
            <p className="text-[11px] text-(--color-text-tertiary)">No earlier versions.</p>
          ) : (
            versions.map((v) => (
              <div
                key={v.id}
                className="flex items-center gap-2 py-2 border-b border-(--color-border-subtle) last:border-0"
              >
                <span className="flex-1 min-w-0 text-[11px] text-(--color-text-secondary)">
                  v{v.version} · {dollars(v.homeValue, 0)} · {dollars(v.monthlyPayment, 0)}/mo
                </span>
                <button
                  type="button"
                  onClick={() => void restore(v.version)}
                  data-testid={`restore-${v.version}`}
                  className="shrink-0 text-[11px] text-(--color-accent)"
                >
                  Restore
                </button>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function Figure({
  label,
  value,
  accent = false,
  negative = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
  negative?: boolean;
}) {
  return (
    <div>
      <dt className="text-(--color-text-tertiary)">{label}</dt>
      <dd
        className={`font-(--font-mono) ${
          negative
            ? "text-(--color-danger)"
            : accent
              ? "text-(--color-accent)"
              : "text-(--color-text-primary)"
        }`}
      >
        {value}
      </dd>
    </div>
  );
}
