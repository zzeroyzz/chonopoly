"use client";

import { type MortgageInputs } from "@/lib/mortgage/types";
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

export function AffordabilityPanel({
  inputs,
  affordability,
  required,
}: {
  inputs: MortgageInputs;
  affordability: AffordabilityResult;
  required: RequiredIncome;
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

          <div className="mt-4">
            {front !== null && (
              <Line
                label={`Housing ratio (${front}%)`}
                value={`${dollars(required.frontEndMonthly)}/mo`}
                emphasis={required.binding === "front"}
              />
            )}
            {back !== null && (
              <Line
                label={`With your other debt (${back}%)`}
                value={`${dollars(required.backEndMonthly)}/mo`}
                emphasis={required.binding === "back"}
              />
            )}
          </div>

          <p className="text-[11px] text-(--color-text-tertiary) mt-2 leading-relaxed">
            You have to clear both, so the higher one governs.
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
          <p className="text-[12px] text-(--color-text-secondary) mt-2">
            Maximum purchase price at {dollars(affordability.maxHousingPayment)}/mo housing payment.
            {affordability.binding === "front"
              ? " Limited by the housing ratio — a bigger down payment or a cheaper house raises it."
              : " Limited by your total debt — paying down other monthly debt raises it."}
          </p>
          <p className="text-[11px] text-(--color-text-tertiary) mt-2 leading-relaxed">
            Rounded to the nearest $500, assuming a conservative mortgage insurance rate.
          </p>
          </Disclosure>
        </Card>
      )}
    </>
  );
}
