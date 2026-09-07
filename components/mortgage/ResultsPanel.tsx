"use client";

import { StatCard } from "@/components/budget/StatCard";
import { type MortgageInputs, type MortgageResult } from "@/lib/mortgage/types";
import { LOAN_TYPE_CONFIG } from "@/lib/mortgage/loanTypes";
import { Card, SectionLabel } from "./fields";
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

export function ResultsPanel({ inputs, result }: { inputs: MortgageInputs; result: MortgageResult }) {
  const config = LOAN_TYPE_CONFIG[inputs.loanType];
  const hasMi = result.monthlyMortgageInsurance > 0;

  return (
    <div className="grid gap-4" style={{ alignContent: "start" }}>
      <Card>
        <SectionLabel>Monthly payment</SectionLabel>
        <p className="text-[40px] leading-none font-bold font-(--font-mono) text-(--color-text-primary)">
          {dollars(result.totalMonthlyWithMortgageInsurance, 0)}
        </p>
        {result.totalMonthlyAfterMortgageInsurance !== null && (
          <p className="text-[12px] text-(--color-text-secondary) mt-2">
            {dollars(result.totalMonthlyAfterMortgageInsurance, 0)} after mortgage insurance ends in{" "}
            <span className="text-(--color-accent)">{monthYear(result.mortgageInsuranceEndDate)}</span>
          </p>
        )}

        <div className="mt-4">
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

      {/* ── Totals ─────────────────────────────────────────────────────── */}
      <Card>
        <SectionLabel>Over the life of the loan</SectionLabel>
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
      </Card>
    </div>
  );
}
