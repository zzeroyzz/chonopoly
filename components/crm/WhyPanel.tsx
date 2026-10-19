"use client";

import Link from "next/link";
import { Check, X } from "lucide-react";
import { type DealCheck } from "@/lib/deal/explainDeal";
import { Card, SectionLabel } from "@/components/mortgage/fields";

/**
 * Why this house got the verdict it got.
 *
 * Sits at the top of the Deal tab because it is the question people actually
 * arrive with. A verdict without its reasons is something to argue with and no
 * way to argue — and the fixes underneath are the part that changes a deal.
 */
export function WhyPanel({
  checks,
  arvHref,
}: {
  checks: DealCheck[];
  /** The ARV step, for the check that sends you there. */
  arvHref?: string;
}) {
  if (checks.length === 0) return null;

  const failing = checks.filter((c) => !c.passed);

  return (
    <Card>
      <SectionLabel>Why</SectionLabel>

      <p className="text-[12px] text-(--color-text-secondary) leading-relaxed mb-3">
        {failing.length === 0
          ? "Everything here clears. This one is worth an offer."
          : failing.length === 1
            ? "One thing is holding this house back."
            : `${failing.length} things are holding this house back.`}
      </p>

      <div className="grid gap-3">
        {checks.map((check) => (
          <div
            key={check.id}
            data-testid={`why-${check.id}`}
            data-passed={check.passed ? "yes" : "no"}
            className="flex gap-2"
          >
            <span
              className={`shrink-0 mt-0.5 ${
                check.passed ? "text-(--color-accent)" : "text-(--color-danger)"
              }`}
            >
              {check.passed ? <Check size={13} /> : <X size={13} />}
            </span>
            <div className="min-w-0">
              <p className="text-[12px] text-(--color-text-primary)">
                {check.label}: <span className="font-(--font-mono)">{check.actual}</span>
              </p>
              <p className="text-[11px] text-(--color-text-tertiary) leading-relaxed">
                {check.target}
              </p>
              {check.fix && (
                <p className="text-[11px] text-(--color-accent) leading-relaxed mt-0.5">
                  {check.fix}
                  {check.id === "arv-unreviewed" && arvHref && (
                    <>
                      {" "}
                      <Link href={arvHref} className="underline underline-offset-2">
                        Open the ARV step
                      </Link>
                    </>
                  )}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
