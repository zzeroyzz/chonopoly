"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Building2, ChevronRight, Plus } from "lucide-react";
import { SkeletonList, SkeletonRegion } from "@/components/ui/Skeleton";
import { type Company } from "@/lib/crm/types";
import { useCrmContext } from "./useCrmContext";
import { AddCompanyForm } from "./AddCompanyForm";

/**
 * The businesses houses come from.
 *
 * Properties answers "do the numbers work on this house". This answers "who
 * has houses" — a hard money lender with an inventory, a wholesaler, a bank.
 * It replaced the pipeline, which was the same rows as Properties arranged by
 * stage and so could never be named: every honest name for it was either
 * jargon or a word already true of the other tab.
 */

/** How many houses they hold, said as a sentence rather than a bare number. */
export function portfolioLine(count: number): string {
  if (count === 0) return "No houses recorded yet";
  return `${count} ${count === 1 ? "house" : "houses"} in their portfolio`;
}

export function CompaniesPage() {
  const { ctx, ctxParams } = useCrmContext();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  /**
   * Bumped after a company is added, which re-runs the effect below.
   *
   * The fetch lives inside the effect rather than in a callback the effect
   * calls: a setState reached synchronously from an effect cascades a render,
   * and React's lint rule follows the call to find it.
   */
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!ctxParams) return;
    let cancelled = false;

    void (async () => {
      try {
        const res = await fetch(`/api/crm/companies?${ctxParams}`);
        if (!res.ok) throw new Error((await res.json()).error ?? "Failed to load");
        const data = await res.json();
        if (cancelled) return;
        setError(null);
        setCompanies(data.companies ?? []);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Couldn't load your companies");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [ctxParams, reloadKey]);

  return (
    <div className="overflow-y-auto flex-1 w-full px-4 pb-24 lg:px-8 lg:pb-8 max-w-3xl">
      <div className="flex items-baseline justify-between gap-3 mt-4 mb-1">
        <h1 className="text-[18px] font-semibold text-(--color-text-primary)">Companies</h1>
        <button
          type="button"
          onClick={() => setAdding(true)}
          data-testid="add-company"
          className="inline-flex items-center gap-1.5 h-9 px-3 rounded-(--radius-pill)
            bg-(--color-accent) text-(--color-base) text-[13px] font-semibold"
        >
          <Plus size={14} />
          Add
        </button>
      </div>

      {/* Every page opens with one plain sentence saying what it is for. */}
      <p className="text-[12px] text-(--color-text-secondary) leading-relaxed mb-4">
        The businesses houses come from — lenders, wholesalers, banks — and what
        each of them has.
      </p>

      {error && (
        <div
          data-testid="companies-error"
          className="mb-3 text-[12px] text-(--color-danger) border border-(--color-danger) rounded-(--radius-md) px-3 py-2"
        >
          {error} Pull down to try again.
        </div>
      )}

      {loading && ctx ? (
        <SkeletonRegion label="Loading your companies" testId="companies-loading">
          <SkeletonList count={3}>
            {(i) => (
              <div
                key={i}
                className="h-16 rounded-(--radius-lg) border border-(--color-border-default)"
              />
            )}
          </SkeletonList>
        </SkeletonRegion>
      ) : companies.length === 0 ? (
        /* An empty screen says what goes there and how to fill it. */
        <div
          data-testid="companies-empty"
          className="border border-(--color-border-default) rounded-(--radius-lg) px-4 py-8 text-center"
        >
          <p className="text-[14px] font-medium text-(--color-text-primary)">
            No companies yet
          </p>
          <p className="text-[12px] text-(--color-text-secondary) mt-1 leading-relaxed">
            When you find a lender or a wholesaler with houses for sale, put them
            here and keep their whole list in one place.
          </p>
          <button
            type="button"
            onClick={() => setAdding(true)}
            data-testid="companies-empty-add"
            className="mt-4 inline-flex items-center gap-1.5 h-10 px-4 rounded-(--radius-pill)
              bg-(--color-accent) text-(--color-base) text-[13px] font-semibold"
          >
            <Plus size={14} />
            Add a company
          </button>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {companies.map((company) => (
            <li key={company.id}>
              <Link
                href={`/companies/${company.id}`}
                data-testid={`company-${company.id}`}
                className="flex items-center gap-3 p-3 rounded-(--radius-lg)
                  border border-(--color-border-default) bg-(--color-surface)
                  hover:border-(--color-border-strong) transition-colors"
              >
                <span className="shrink-0 flex items-center justify-center w-9 h-9 rounded-(--radius-lg) bg-(--color-elevated) text-(--color-text-secondary)">
                  <Building2 size={16} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-medium text-(--color-text-primary) truncate">
                    {company.name}
                  </span>
                  <span className="block text-[12px] text-(--color-text-secondary)">
                    {portfolioLine(company.propertyCount)}
                  </span>
                </span>
                <ChevronRight size={16} className="shrink-0 text-(--color-text-tertiary)" />
              </Link>
            </li>
          ))}
        </ul>
      )}

      {adding && ctxParams && (
        <AddCompanyForm
          ctxParams={ctxParams}
          onSaved={() => {
            setAdding(false);
            setReloadKey((k) => k + 1);
          }}
          onCancel={() => setAdding(false)}
        />
      )}
    </div>
  );
}
