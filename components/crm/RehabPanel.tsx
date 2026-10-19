"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ExternalLink, CalendarPlus, Check } from "lucide-react";
import {
  REHAB_SYSTEMS,
  SYSTEM_LABEL,
  CONDITION_LABEL,
  emptyEstimate,
  type RehabCondition,
  type RehabEstimate,
} from "@/lib/rehab/types";
import { calculateRehab, budgetCheck } from "@/lib/rehab/calculateRehab";
import { type BuyerProfile } from "@/lib/profile/types";
import { NumberField, Card, SectionLabel } from "@/components/mortgage/fields";
import { dollars } from "@/components/mortgage/format";
import { BudgetCheckLine } from "./BudgetCheckLine";

/**
 * The rehab estimate, worked system by system.
 *
 * The listing link sits at the top because this is usually done from photos,
 * one system at a time, with the listing open in another tab. The source is
 * recorded on the estimate rather than inferred, because it decides the
 * contingency — photos cannot see a cracked heat exchanger.
 */

interface Props {
  propertyId: string;
  ctxParams: string;
  listingUrl: string | null;
  /** The reno budget on the primary financing analysis, for the check. */
  renovationBudget: number;
  profile: BuyerProfile | null;
  visitCompletedAt: string | null;
  /** The CRM entry the visit task hangs off. Null when the house has none. */
  entryId: string | null;
  /** Opens Run the numbers prefilled with a new rehab budget. */
  onRerun: (rehabBudget: number) => void;
  /** After a save, so the Profit card and the cards re-read. */
  onSaved: () => void | Promise<void>;
}

export function RehabPanel({
  propertyId,
  ctxParams,
  listingUrl,
  renovationBudget,
  profile,
  visitCompletedAt,
  entryId,
  onRerun,
  onSaved,
}: Props) {
  const [estimate, setEstimate] = useState<RehabEstimate>(() => emptyEstimate());
  const [saved, setSaved] = useState(false);
  const [version, setVersion] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scheduling, setScheduling] = useState(false);
  const [visitNote, setVisitNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/properties/${propertyId}/rehab?${ctxParams}`);
      if (res.ok) {
        const body = (await res.json()) as {
          rehab: { estimate: RehabEstimate; version: number } | null;
        };
        if (body.rehab) {
          setEstimate(body.rehab.estimate);
          setVersion(body.rehab.version);
        }
      }
    } catch {
      // No estimate is a real state; the budget stands in.
    } finally {
      setLoading(false);
    }
  }, [propertyId, ctxParams]);

  useEffect(() => {
    (async () => {
      await load();
    })();
  }, [load]);

  // Memoised so it is not a new object on every render, which would re-run
  // the calculation below for nothing.
  const contingency = useMemo(
    () => ({
      photosPct: profile?.defaults.contingencyPhotosPct ?? 20,
      visitPct: profile?.defaults.contingencyVisitPct ?? 10,
    }),
    [profile?.defaults.contingencyPhotosPct, profile?.defaults.contingencyVisitPct]
  );

  const result = useMemo(() => calculateRehab(estimate, contingency), [estimate, contingency]);
  const check = budgetCheck(renovationBudget, result.total);

  function patchLine(system: string, patch: Partial<{ condition: RehabCondition; cost: number; note: string }>) {
    setSaved(false);
    setEstimate((prev) => ({
      ...prev,
      lines: prev.lines.map((l) =>
        l.system === system
          ? {
              ...l,
              ...patch,
              // Good costs nothing; switching to good clears what was typed.
              ...(patch.condition === "good" ? { cost: 0 } : {}),
            }
          : l
      ),
    }));
  }

  async function save() {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/properties/${propertyId}/rehab?${ctxParams}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estimate, context_type: "personal" }),
      });
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(b.error ?? "Could not save the estimate");
      }
      const body = (await res.json()) as { rehab: { version: number } };
      setVersion(body.rehab.version);
      setSaved(true);
      await onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the estimate");
    } finally {
      setSaving(false);
    }
  }

  /** Creates the CRM task. The walkthrough itself switches the source. */
  async function scheduleVisit() {
    if (scheduling) return;
    setScheduling(true);
    setError(null);
    try {
      if (!entryId) throw new Error("This house has no pipeline entry to attach a task to");

      const due = new Date();
      due.setDate(due.getDate() + 3);
      const res = await fetch(`/api/crm/tasks?${ctxParams}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pipeline_entry_id: entryId,
          title: "Visit the house",
          due_date: due.toISOString().slice(0, 10),
          context_type: "personal",
        }),
      });
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(b.error ?? "Could not schedule the visit");
      }
      setVisitNote("Visit task added to this house's Activity.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not schedule the visit");
    } finally {
      setScheduling(false);
    }
  }

  if (loading) {
    return <p className="text-[12px] text-(--color-text-secondary)">Loading the estimate…</p>;
  }

  return (
    <div data-testid="panel-rehab" className="grid gap-4">
      {/* The listing, first. This is worked from photos. */}
      {listingUrl ? (
        <a
          href={listingUrl}
          target="_blank"
          rel="noopener noreferrer"
          data-testid="rehab-listing-link"
          className="inline-flex items-center gap-1.5 text-[12px] text-(--color-accent)"
        >
          <ExternalLink size={13} />
          Open the listing photos
        </a>
      ) : (
        <p className="text-[11px] text-(--color-text-tertiary)">
          No listing link on this house — add one from Edit to work from photos.
        </p>
      )}

      <BudgetCheckLine check={check} onRerun={() => onRerun(result.total)} />

      <Card>
        <SectionLabel>
          {estimate.source === "visit" ? "From the visit" : "From the photos"}
        </SectionLabel>

        <div className="grid gap-3">
          {REHAB_SYSTEMS.map((system) => {
            const line = estimate.lines.find((l) => l.system === system)!;
            return (
              <div
                key={system}
                data-testid={`rehab-${system}`}
                className="border-b border-(--color-border-subtle) last:border-0 pb-3 last:pb-0"
              >
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <span className="text-[13px] text-(--color-text-primary)">
                    {SYSTEM_LABEL[system]}
                  </span>
                  <span className="text-[12px] font-(--font-mono) text-(--color-text-secondary)">
                    {line.condition === "good" ? "$0" : dollars(line.cost, 0)}
                  </span>
                </div>

                <div className="flex gap-1.5 mb-2">
                  {(["good", "repair", "replace"] as const).map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => patchLine(system, { condition: c })}
                      data-testid={`rehab-${system}-${c}`}
                      aria-pressed={line.condition === c}
                      className={`flex-1 h-8 rounded-md text-[11px] transition-colors ${
                        line.condition === c
                          ? "bg-(--color-accent) text-(--color-base) font-semibold"
                          : "border border-(--color-border-default) text-(--color-text-secondary)"
                      }`}
                    >
                      {CONDITION_LABEL[c]}
                    </button>
                  ))}
                </div>

                {/* Good needs no cost box: it is $0 by definition. */}
                {line.condition !== "good" && (
                  <div className="grid gap-2">
                    <NumberField
                      label=""
                      testId={`rehab-${system}-cost`}
                      value={line.cost}
                      onChange={(cost) => patchLine(system, { cost })}
                      prefix="$"
                      placeholder="0"
                      blankWhenZero
                      min={0}
                    />
                    <input
                      value={line.note}
                      onChange={(e) => patchLine(system, { note: e.target.value })}
                      placeholder="What you saw"
                      aria-label={`${SYSTEM_LABEL[system]} note`}
                      data-testid={`rehab-${system}-note`}
                      className="w-full h-9 rounded-md bg-(--color-elevated) border border-(--color-border-default) px-3 text-[12px] text-(--color-text-primary) focus:outline-none focus:border-(--color-accent)"
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-3 pt-3 border-t border-(--color-border-subtle) grid gap-1 text-[12px]">
          <Row label="Subtotal" value={dollars(result.subtotal, 0)} />
          <Row
            label={`Contingency (${result.contingencyPct}% · ${
              estimate.source === "visit" ? "visit" : "photos"
            })`}
            value={dollars(result.contingency, 0)}
          />
          <Row label="Total" value={dollars(result.total, 0)} strong />
          {result.unpriced > 0 && (
            <p className="text-[11px] text-(--color-warning) mt-1">
              {result.unpriced} system{result.unpriced === 1 ? "" : "s"} marked for work with no
              cost yet.
            </p>
          )}
        </div>
      </Card>

      {/* The visit. Optional, and it refines this estimate rather than
          replacing it — the photo version stays in the history. */}
      <Card>
        <SectionLabel>Visit</SectionLabel>
        {visitCompletedAt ? (
          <p className="text-[12px] text-(--color-accent) inline-flex items-center gap-1.5">
            <Check size={13} /> Visited {new Date(visitCompletedAt).toLocaleDateString()}
          </p>
        ) : (
          <button
            type="button"
            onClick={() => void scheduleVisit()}
            disabled={scheduling}
            data-testid="schedule-visit"
            className="inline-flex items-center gap-1.5 text-[12px] text-(--color-accent) disabled:opacity-40"
          >
            <CalendarPlus size={13} />
            {scheduling ? "Scheduling…" : "Schedule visit"}
          </button>
        )}
        {visitNote && <p className="text-[11px] text-(--color-accent) mt-1.5">{visitNote}</p>}

        <label className="block mt-3">
          <span className="block text-[10px] uppercase tracking-widest text-(--color-text-tertiary) mb-1">
            Visit notes
          </span>
          <textarea
            value={estimate.visitNotes}
            onChange={(e) => {
              setSaved(false);
              setEstimate((prev) => ({ ...prev, visitNotes: e.target.value }));
            }}
            rows={3}
            placeholder="What the photos could not show"
            data-testid="visit-notes"
            className="w-full rounded-md bg-(--color-elevated) border border-(--color-border-default) px-3 py-2 text-[12px] text-(--color-text-primary) focus:outline-none focus:border-(--color-accent)"
          />
        </label>

        {/* Switching the source switches the contingency with it, which is the
            reason to bother walking the house. */}
        <button
          type="button"
          onClick={() => {
            setSaved(false);
            setEstimate((prev) => ({
              ...prev,
              source: prev.source === "visit" ? "photos" : "visit",
            }));
          }}
          data-testid="toggle-source"
          className="text-[12px] text-(--color-accent) mt-2"
        >
          {estimate.source === "visit"
            ? `Back to a photo estimate (${contingency.photosPct}% contingency)`
            : `Mark this as from the visit (${contingency.visitPct}% contingency)`}
        </button>
      </Card>

      {error && <p className="text-[12px] text-(--color-danger)">{error}</p>}
      {saved && (
        <p data-testid="rehab-saved" className="text-[12px] text-(--color-accent)">
          Saved{version > 1 ? ` · ${version} versions` : ""}.
        </p>
      )}

      <button
        type="button"
        onClick={() => void save()}
        disabled={saving}
        data-testid="save-rehab"
        className="h-11 rounded-[var(--radius-pill)] bg-(--color-accent) text-(--color-base) text-[14px] font-semibold disabled:opacity-40"
      >
        {saving ? "Saving…" : "Save the estimate"}
      </button>
    </div>
  );
}

function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className={strong ? "text-(--color-text-primary)" : "text-(--color-text-secondary)"}>
        {label}
      </span>
      <span
        className={`font-(--font-mono) ${
          strong ? "text-(--color-text-primary) font-semibold" : "text-(--color-text-secondary)"
        }`}
      >
        {value}
      </span>
    </div>
  );
}
