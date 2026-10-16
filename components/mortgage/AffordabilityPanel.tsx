"use client";

import { type MortgageInputs, type DtiResult, type RatioStatus } from "@/lib/mortgage/types";
import { type AffordabilityResult, type RequiredIncome } from "@/lib/mortgage/affordability";
import { LOAN_TYPE_CONFIG } from "@/lib/mortgage/loanTypes";
import { Card, Disclosure } from "./fields";
import { dollars } from "./format";

function Line({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between py-1.5 border-b border-(--color-border-subtle) last:border-0">
      <span className="text-[12px] text-(--color-text-secondary)">{label}</span>
      <span
        className={`text-[13px] font-(--font-mono) ${
          emphasis ? "text-(--color-accent) font-semibold" : "text-(--color-text-primary)"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

const STATUS_LABEL: Record<RatioStatus, string> = {
  pass: "under",
  caution: "slightly over",
  fail: "over",
};
const STATUS_COLOR: Record<RatioStatus, string> = {
  pass: "var(--color-accent)",
  caution: "#f59e0b",
  fail: "var(--color-danger)",
};

/**
 * One ratio: what yours is, what the guideline is, and whether you clear it.
 *
 * The verdict is the point. The income figure stays because it answers the
 * other question — what you'd need to earn — but it is no longer the only
 * thing on the row.
 */
function RatioRow({
  label,
  guideline,
  actual,
  status,
  requiredIncome,
  binding,
}: {
  label: string;
  guideline: number;
  actual?: number;
  status?: RatioStatus;
  requiredIncome: string;
  binding: boolean;
}) {
  return (
    <div className="py-2 border-b border-(--color-border-subtle) last:border-0">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[12px] text-(--color-text-secondary)">
          {label}
          {binding && (
            <span className="text-[10px] text-(--color-text-tertiary) ml-1.5">governs</span>
          )}
        </span>
        {actual !== undefined && status !== undefined ? (
          <span
            className="text-[13px] font-(--font-mono)"
            style={{ color: STATUS_COLOR[status] }}
          >
            {actual.toFixed(1)}% {STATUS_LABEL[status]} {guideline}%
          </span>
        ) : (
          <span className="text-[13px] font-(--font-mono) text-(--color-text-primary)">
            {guideline}%
          </span>
        )}
      </div>
      <p className="text-[11px] text-(--color-text-tertiary) mt-0.5">
        needs {requiredIncome} to clear it
      </p>
    </div>
  );
}

export function AffordabilityPanel({
  inputs,
  affordability,
  required,
  dti,
}: {
  inputs: MortgageInputs;
  affordability: AffordabilityResult;
  required: RequiredIncome;
  /** Your actual ratios and whether they clear. Computed once by the caller. */
  dti?: DtiResult;
}) {
  if (!required.applicable) return null;

  const config = LOAN_TYPE_CONFIG[inputs.loanType];
  const front = config.frontEndGuideline;
  const back = config.backEndGuideline;

  return (
    <>
      {/* Given this house, what income does it take? Dollars, not percentages —
          a number you can hold against a payslip. */}
      {required.requiredMonthly > 0 && (
        <Card>
          {/* The verdict and the required figure are already in the payment
              card. This is the working behind them, so it opens on demand. */}
          <Disclosure
            label="Income needed for this house"
            summary={`${dollars(required.requiredMonthly)}/mo`}
          >
          <p className="text-[12px] text-(--color-text-secondary) mb-1.5">
            {dollars(required.requiredAnnual)} a year, gross.
          </p>

          {/* These rows used to show only the income each guideline demands,
              which never said whether YOU clear it. dti already computes both
              your actual ratio and a pass/caution/fail verdict; it simply was
              not being displayed anywhere. */}
          <div className="mt-4">
            {front !== null && (
              <RatioRow
                label="Housing ratio"
                guideline={front}
                actual={dti?.frontEnd}
                status={dti?.frontStatus}
                requiredIncome={`${dollars(required.frontEndMonthly)}/mo`}
                binding={required.binding === "front"}
              />
            )}
            {back !== null && (
              <RatioRow
                label="With your other debt"
                guideline={back}
                actual={dti?.backEnd}
                status={dti?.backStatus}
                requiredIncome={`${dollars(required.backEndMonthly)}/mo`}
                binding={required.binding === "back"}
              />
            )}
          </div>

          <p className="text-[11px] text-(--color-text-tertiary) mt-2 leading-relaxed">
            You have to clear both, so the higher one governs.
            {dti && (dti.frontStatus === "caution" || dti.backStatus === "caution") && (
              <> A few points over a guideline is common and still approvable.</>
            )}
          </p>

          {/* Three aligned rows rather than a sentence. "Your $7,000/mo is
              $12,662 short" puts two different magnitudes in one line and makes
              the reader do the subtraction to check it. */}
          {required.qualifies !== null && (
            <div className="mt-4 pt-3 border-t border-(--color-border-subtle)">
              <Line label="Needed" value={`${dollars(required.requiredMonthly)}/mo`} />
              <Line label="You have" value={`${dollars(inputs.grossMonthlyIncome)}/mo`} />
              <div className="flex items-baseline justify-between pt-2">
                <span
                  className="text-[12px] font-medium"
                  style={{
                    color: required.qualifies ? "var(--color-accent)" : "var(--color-danger)",
                  }}
                >
                  {required.qualifies ? "Over by" : "Short by"}
                </span>
                <span
                  className="text-[15px] font-semibold font-(--font-mono)"
                  style={{
                    color: required.qualifies ? "var(--color-accent)" : "var(--color-danger)",
                  }}
                >
                  {dollars(Math.abs(required.surplusMonthly ?? 0))}/mo
                </span>
              </div>
            </div>
          )}
          </Disclosure>
        </Card>
      )}

      {/* And the inverse: given your income, how much house? */}
      {affordability.maxPurchasePrice > 0 && (
        <Card>
          <Disclosure
            label="What your income supports"
            summary={dollars(affordability.maxPurchasePrice)}
          >
          {/* The figure has to appear here too. The Disclosure hides its summary
              when open, so putting the price only there left this section
              expanding into a sentence about a number you could no longer see. */}
          <p className="text-[28px] leading-none font-bold font-(--font-mono) text-(--color-text-primary) mt-1">
            {dollars(affordability.maxPurchasePrice)}
          </p>
          <p className="text-[12px] text-(--color-text-secondary) mt-1">
            the most you can buy at {dollars(affordability.maxHousingPayment)}/mo
          </p>

          {/* Labelled rows, because the two figures answer different questions
              and the old sentence ran them together. */}
          <div className="mt-3">
            <Line
              label="Limited by"
              value={affordability.binding === "front" ? "Housing ratio" : "Your total debt"}
            />
          </div>

          <p className="text-[11px] text-(--color-text-tertiary) mt-2 leading-relaxed">
            {affordability.binding === "front"
              ? "A bigger down payment or a cheaper house raises it."
              : "Paying down other monthly debt raises it."}{" "}
            Rounded to the nearest $500, assuming a conservative mortgage insurance rate.
          </p>
          </Disclosure>
        </Card>
      )}
    </>
  );
}
