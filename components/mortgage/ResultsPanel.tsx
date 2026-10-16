"use client";

import { StatCard } from "@/components/ui/StatCard";
import { type MortgageInputs, type MortgageResult } from "@/lib/mortgage/types";
import { LOAN_TYPE_CONFIG, BORROWER_MINIMUM_INVESTMENT } from "@/lib/mortgage/loanTypes";
import { Card, SectionLabel, Disclosure } from "./fields";
import { dollars, percent, monthYear } from "./format";

function Line({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-baseline justify-between py-1.5 border-b border-(--color-border-subtle) last:border-0">
      <span className={`text-[12px] ${muted ? "text-(--color-text-tertiary)" : "text-(--color-text-secondary)"}`}>
        {label}
      </span>
      <span className="text-[13px] font-(--font-mono) text-(--color-text-primary)">{value}</span>
    </div>
  );
}

/** A ruled total, so the arithmetic above it reads as arithmetic. */
function Subtotal({ label, value, emphasis }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div className="flex items-baseline justify-between pt-2 mt-1 border-t border-(--color-border-strong)">
      <span
        className={`text-[12px] ${emphasis ? "text-(--color-text-primary) font-medium" : "text-(--color-text-secondary)"}`}
      >
        {label}
      </span>
      <span
        className={`font-(--font-mono) ${emphasis ? "text-[15px] text-(--color-accent) font-semibold" : "text-[13px] text-(--color-text-primary)"}`}
      >
        {value}
      </span>
    </div>
  );
}

export function ResultsPanel({
  inputs,
  result,
  verdict,
}: {
  inputs: MortgageInputs;
  result: MortgageResult;
  /** Affordability, read from the same source the detail panel uses — not recomputed. */
  verdict?: { affordable: boolean; required: number; actual: number };
}) {
  const config = LOAN_TYPE_CONFIG[inputs.loanType];
  const hasMi = result.monthlyMortgageInsurance > 0;

  return (
    <div className="grid gap-4" style={{ alignContent: "start" }}>
      {/* A boundary, so it's obvious you've stopped typing and started reading. */}
      <div className="flex items-center gap-3 pt-1">
        <span className="text-[10px] uppercase tracking-[0.14em] text-(--color-text-tertiary)">
          Results
        </span>
        <span className="flex-1 h-px bg-(--color-border-subtle)" />
      </div>

      <Card>
        <SectionLabel>Monthly payment</SectionLabel>
        <p className="text-[40px] leading-none font-bold font-(--font-mono) text-(--color-text-primary)">
          {dollars(result.totalMonthlyWithMortgageInsurance, 0)}
          <span className="text-[16px] font-normal text-(--color-text-tertiary)">/mo</span>
        </p>

        {/* The verdict belongs next to the number it judges, not two thousand
            pixels further down in a card with its own competing headline. */}
        {verdict && (
          <p
            className="text-[13px] mt-2.5 font-medium"
            style={{ color: verdict.affordable ? "var(--color-accent)" : "var(--color-danger)" }}
          >
            {verdict.affordable ? "✓ Within your income" : "✗ Above what your income supports"}
          </p>
        )}
        {verdict && (
          <p className="text-[11px] text-(--color-text-tertiary) mt-0.5">
            needs {dollars(verdict.required, 0)}/mo · you have {dollars(verdict.actual, 0)}/mo
          </p>
        )}

        {result.totalMonthlyAfterMortgageInsurance !== null && (
          <p className="text-[12px] text-(--color-text-secondary) mt-2">
            {dollars(result.totalMonthlyAfterMortgageInsurance, 0)} after mortgage insurance ends in{" "}
            <span className="text-(--color-accent)">{monthYear(result.mortgageInsuranceEndDate)}</span>
          </p>
        )}

        <div className="mt-4 pt-3 border-t border-(--color-border-subtle)">
          <Disclosure label="Monthly breakdown">
            <Line label="Principal & interest" value={dollars(result.principalAndInterest, 0)} />
            <Line label="Property tax" value={dollars(result.monthlyTax, 0)} />
            <Line label="Home insurance" value={dollars(result.monthlyInsurance, 0)} />
            {result.monthlyHoa > 0 && <Line label="HOA" value={dollars(result.monthlyHoa, 0)} />}
            {hasMi && (
              <Line
                label={config.showMip ? "Mortgage insurance (MIP)" : "Mortgage insurance (PMI)"}
                value={dollars(result.monthlyMortgageInsurance, 0)}
              />
            )}
            {result.dpaMonthlyPayment > 0 && (
              <Line label="Assistance second" value={dollars(result.dpaMonthlyPayment, 0)} />
            )}
          </Disclosure>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <StatCard
          label="Loan amount"
          value={dollars(result.loanAmount, 0)}
          subtext={result.financedFees > 0 ? `incl. ${dollars(result.financedFees, 0)} financed` : undefined}
        />
        <StatCard
          label="Down payment"
          value={dollars(result.downPaymentAmount, 0)}
          subtext={percent(result.downPaymentPercent)}
        />
        <StatCard label="Total interest" value={dollars(result.totalInterest, 0)} variant="warning" />
        <StatCard
          label={result.isInterestOnly ? "Balloon due" : "Payoff"}
          value={result.isInterestOnly ? dollars(result.balloonAmount ?? 0, 0) : monthYear(result.payoffDate)}
          subtext={result.isInterestOnly ? monthYear(result.payoffDate) : undefined}
          variant={result.isInterestOnly ? "danger" : "default"}
        />
      </div>

      {/* ── Loan-type specific ─────────────────────────────────────────── */}
      {config.showMip && result.ufmip !== undefined && (
        <Card>
          <SectionLabel>FHA</SectionLabel>
          <Line label="Upfront MIP (1.75%)" value={dollars(result.ufmip, 0)} />
          <Line
            label="Financed into loan"
            value={inputs.fhaUfmipFinanced ? "Yes" : "No — paid at closing"}
          />
          <Line
            label="MIP duration"
            value={
              result.mortgageInsuranceEndPeriod
                ? `${result.mortgageInsurancePaymentCount} payments`
                : "Life of loan"
            }
          />
        </Card>
      )}

      {config.showVaFundingFee && result.vaFundingFee !== undefined && (
        <Card>
          <SectionLabel>VA</SectionLabel>
          <Line
            label="Funding fee"
            value={inputs.vaExempt ? "Exempt" : dollars(result.vaFundingFee, 0)}
          />
          {!inputs.vaExempt && (
            <Line
              label="Financed into loan"
              value={inputs.vaFundingFeeFinanced ? "Yes" : "No — paid at closing"}
            />
          )}
          <Line label="Monthly mortgage insurance" value="None" muted />
        </Card>
      )}

      {config.isHardMoney && (
        <Card>
          <SectionLabel>Hard money</SectionLabel>
          <Line label="Points cost" value={dollars(result.pointsCost ?? 0, 0)} />
          <Line label="Total interest over term" value={dollars(result.totalInterest, 0)} />
          <Line label="Balloon at term end" value={dollars(result.balloonAmount ?? 0, 0)} />
          {result.loanToArv !== null && result.loanToArv !== undefined && (
            <Line label="Loan to ARV" value={percent(result.loanToArv)} />
          )}
          {result.loanToAfterRepairValue !== null && (
            <Line
              label="Loan to after-repair value"
              value={percent(result.loanToAfterRepairValue)}
            />
          )}
        </Card>
      )}

      {config.isDscr && result.dscr && (
        <Card>
          <SectionLabel>DSCR</SectionLabel>
          <p
            className="text-[32px] leading-none font-bold font-(--font-mono)"
            style={{ color: result.dscr.passes ? "var(--color-accent)" : "var(--color-danger)" }}
          >
            {result.dscr.ratio.toFixed(2)}
          </p>
          <p className="text-[12px] mt-1.5 mb-3" style={{ color: result.dscr.passes ? "var(--color-accent)" : "var(--color-danger)" }}>
            {result.dscr.passes ? "Passes" : "Below"} the {inputs.dscrThreshold.toFixed(2)} threshold
          </p>
          <Line label="Net operating income" value={`${dollars(result.dscr.noi, 0)}/yr`} />
          <Line label="Annual debt service" value={`${dollars(result.dscr.annualDebtService, 0)}/yr`} />
        </Card>
      )}

      <Card>
        <SectionLabel>Cash to close</SectionLabel>
        <p className="text-[28px] leading-none font-bold font-(--font-mono) text-(--color-text-primary)">
          {dollars(result.cashToClose)}
        </p>
        <div className="mt-3">
          {result.renovationFinanced > 0 && (
            <>
              <Line label="Purchase price" value={dollars(inputs.homeValue, 0)} />
              <Line
                label="Renovation + contingency"
                value={dollars(result.renovationFinanced, 0)}
              />
              <Line
                label="Total acquisition"
                value={dollars(result.totalAcquisitionCost, 0)}
              />
            </>
          )}
          {/* A ledger that sums on the page. It previously listed four figures
              with mixed signs and left the reader to arrive at the total. */}
          <Line label="Down payment" value={dollars(result.downPaymentAmount, 0)} />
          <Line
            label={`Closing costs (${inputs.closingCostPercent}%)`}
            value={dollars(result.closingCosts, 0)}
          />
          {result.feesDueAtClosing > 0 && (
            <Line label="Fees due at closing" value={dollars(result.feesDueAtClosing, 0)} />
          )}

          {result.dpaApplied > 0 && (
            <>
              <Subtotal label="Before assistance" value={dollars(result.cashToCloseBeforeDpa, 0)} />
              <Line label="Assistance" value={`−${dollars(result.dpaApplied, 0)}`} />
              <p className="text-[11px] text-(--color-text-tertiary) pl-3 pb-1.5 leading-relaxed">
                {dollars(result.dpaToDownPayment, 0)} covers the down payment
                {result.dpaToClosing > 0 && <>, {dollars(result.dpaToClosing, 0)} goes to closing</>}
              </p>
              <Subtotal label="You bring" value={dollars(result.cashToClose, 0)} emphasis />
            </>
          )}
        </div>

        {result.borrowerMinimumApplied && (
          <p className="text-[11px] text-(--color-text-tertiary) mt-2 leading-relaxed">
            The award would have covered everything, so cash to close is held at the{" "}
            {dollars(BORROWER_MINIMUM_INVESTMENT, 0)} the program requires you to put in yourself.
          </p>
        )}

        {/* Only reachable by overriding the loan amount above what the purchase
            leaves. The mortgage plus the down payment is the house, so in every
            ordinary deal this is exactly 100% and stays quiet. */}
        {result.combinedLtv > 100 && (
          <p className="text-[11px] text-(--color-warning) mt-2 leading-relaxed">
            Combined LTV is {result.combinedLtv.toFixed(1)}% — the loan amount is higher than this
            purchase leaves room for. Check the loan amount override.
          </p>
        )}

        <p className="text-[11px] text-(--color-text-tertiary) mt-2 leading-relaxed">
          One-time. Deliberately excluded from the monthly payment and the income ratios.
        </p>
      </Card>

      {/* ── Totals ─────────────────────────────────────────────────────── */}
      {/* Reference, not decision. Collapsed so seven near-identical rows stop
          competing with the figures you act on; the headline total stays
          visible on the summary line. */}
      <Card>
        <Disclosure
          label="Over the life of the loan"
          summary={dollars(result.totalOfAllPayments, 0)}
        >
          <Line label="Total of all payments" value={dollars(result.totalOfAllPayments, 0)} />
          <Line label="Annual payment" value={dollars(result.annualPayment, 0)} />
          <Line label="Total property tax" value={dollars(result.totalTax, 0)} />
          <Line label="Total home insurance" value={dollars(result.totalInsurance, 0)} />
          {hasMi && (
            <>
              <Line label="Mortgage insurance payments" value={String(result.mortgageInsurancePaymentCount)} />
              <Line label="Total mortgage insurance" value={dollars(result.mortgageInsuranceTotalPaid, 0)} />
            </>
          )}
          <Line label="Payoff date" value={monthYear(result.payoffDate)} />
        </Disclosure>
      </Card>
    </div>
  );
}
