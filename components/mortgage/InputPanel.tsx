"use client";

import { useState } from "react";
import { type MortgageInputs, type LoanType } from "@/lib/mortgage/types";
import { LOAN_TYPE_CONFIG, LOAN_TYPES } from "@/lib/mortgage/loanTypes";
import { TERM_PRESETS, HARD_MONEY_TERM_PRESETS } from "@/lib/mortgage/defaults";
import { baseLoanAmount, downPaymentPercent } from "@/lib/mortgage/calculate";
import {
  NumberField,
  SelectField,
  SegmentedControl,
  ToggleRow,
  SectionLabel,
  Card,
  FieldLabel,
} from "./fields";
import { MONTH_OPTIONS } from "./format";

interface Props {
  inputs: MortgageInputs;
  onChange: (patch: Partial<MortgageInputs>) => void;
}

export function InputPanel({ inputs, onChange }: Props) {
  const config = LOAN_TYPE_CONFIG[inputs.loanType];
  const [downMode, setDownMode] = useState<"currency" | "percent">("currency");

  const downPercent = downPaymentPercent(inputs);
  const derivedLoan = baseLoanAmount(inputs);

  return (
    <div className="grid gap-4" style={{ alignContent: "start" }}>
      <Card>
        <SectionLabel>Loan</SectionLabel>
        <div className="grid gap-3.5">
          <SelectField
            label="Loan type"
            value={inputs.loanType}
            onChange={(v) => onChange({ loanType: v as LoanType })}
            options={LOAN_TYPES.map((t) => ({ value: t, label: LOAN_TYPE_CONFIG[t].label }))}
          />

          <NumberField
            label="Home value"
            value={inputs.homeValue}
            onChange={(homeValue) => onChange({ homeValue })}
            prefix="$"
            min={0}
          />

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] uppercase tracking-widest text-(--color-text-tertiary) font-medium">
                Down payment
              </span>
              <SegmentedControl
                ariaLabel="Down payment mode"
                value={downMode}
                onChange={setDownMode}
                options={[
                  { value: "currency", label: "$" },
                  { value: "percent", label: "%" },
                ]}
              />
            </div>
            {downMode === "currency" ? (
              <NumberField
                label=""
                value={Math.round(inputs.downPayment)}
                onChange={(downPayment) => onChange({ downPayment })}
                prefix="$"
                hint={`${downPercent.toFixed(1)}% of value`}
                min={0}
              />
            ) : (
              <NumberField
                label=""
                value={Number(downPercent.toFixed(2))}
                onChange={(pct) => onChange({ downPayment: (inputs.homeValue * pct) / 100 })}
                suffix="%"
                hint={`$${Math.round(inputs.downPayment).toLocaleString()}`}
                min={0}
              />
            )}
            {downPercent < config.minDownPercent && (
              <p className="text-[11px] text-(--color-warning) mt-1">
                {config.label} typically requires at least {config.minDownPercent}% down.
              </p>
            )}
          </div>

          <NumberField
            label="Loan amount"
            value={Math.round(derivedLoan)}
            onChange={(loanAmountOverride) => onChange({ loanAmountOverride })}
            prefix="$"
            hint={inputs.loanAmountOverride === null ? "auto" : "edited"}
            min={0}
          />
          {inputs.loanAmountOverride !== null && (
            <button
              type="button"
              onClick={() => onChange({ loanAmountOverride: null })}
              className="text-[11px] text-(--color-accent) text-left -mt-2"
            >
              Reset to home value minus down payment
            </button>
          )}

          <NumberField
            label="Interest rate"
            value={inputs.interestRate}
            onChange={(interestRate) => onChange({ interestRate })}
            suffix="%"
            step="0.001"
            hint="manual entry"
            min={0}
          />

          <div>
            <FieldLabel>{config.isHardMoney ? "Term (months)" : "Term (years)"}</FieldLabel>
            <div className="flex flex-wrap items-center gap-2">
              <div className="w-24">
                <NumberField
                  label=""
                  value={config.isHardMoney ? inputs.termMonths : inputs.termYears}
                  onChange={(n) =>
                    onChange(config.isHardMoney ? { termMonths: n } : { termYears: n })
                  }
                  min={1}
                />
              </div>
              <SegmentedControl
                ariaLabel="Term presets"
                value={config.isHardMoney ? inputs.termMonths : inputs.termYears}
                onChange={(n) =>
                  onChange(config.isHardMoney ? { termMonths: n } : { termYears: n })
                }
                options={(config.isHardMoney ? HARD_MONEY_TERM_PRESETS : TERM_PRESETS).map((n) => ({
                  value: n,
                  label: String(n),
                }))}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <SelectField
              label="Start month"
              value={String(inputs.startMonth)}
              onChange={(v) => onChange({ startMonth: Number(v) })}
              options={MONTH_OPTIONS}
            />
            <NumberField
              label="Start year"
              value={inputs.startYear}
              onChange={(startYear) => onChange({ startYear })}
              min={1900}
            />
          </div>
        </div>
      </Card>

      {/* ── Loan-type specific ─────────────────────────────────────────── */}
      {config.showPmi && (
        <Card>
          <SectionLabel>Mortgage insurance</SectionLabel>
          <NumberField
            label="PMI rate"
            value={inputs.pmiRate}
            onChange={(pmiRate) => onChange({ pmiRate })}
            suffix="%/yr"
            step="0.01"
            hint={downPercent >= 20 ? "not charged at 20%+ down" : "of loan amount"}
            min={0}
          />
        </Card>
      )}

      {config.showMip && (
        <Card>
          <SectionLabel>FHA premiums</SectionLabel>
          <p className="text-[12px] text-(--color-text-secondary) mb-3">
            UFMIP is 1.75% of the loan. Annual MIP replaces PMI and is{" "}
            {downPercent >= 10 ? "removed after 11 years at 10%+ down." : "permanent under 10% down."}
          </p>
          <ToggleRow
            label="Finance UFMIP into the loan"
            checked={inputs.fhaUfmipFinanced}
            onChange={(fhaUfmipFinanced) => onChange({ fhaUfmipFinanced })}
            hint="Uncheck to pay it at closing instead."
          />
        </Card>
      )}

      {config.showVaFundingFee && (
        <Card>
          <SectionLabel>VA funding fee</SectionLabel>
          <ToggleRow
            label="Exempt from the funding fee"
            checked={inputs.vaExempt}
            onChange={(vaExempt) => onChange({ vaExempt })}
          />
          {!inputs.vaExempt && (
            <>
              <ToggleRow
                label="Subsequent use"
                checked={inputs.vaSubsequentUse}
                onChange={(vaSubsequentUse) => onChange({ vaSubsequentUse })}
                hint="Higher rate after a first VA loan."
              />
              <ToggleRow
                label="Finance the fee into the loan"
                checked={inputs.vaFundingFeeFinanced}
                onChange={(vaFundingFeeFinanced) => onChange({ vaFundingFeeFinanced })}
              />
            </>
          )}
          <p className="text-[11px] text-(--color-text-tertiary) mt-2">
            No monthly mortgage insurance on a VA loan.
          </p>
        </Card>
      )}

      {config.isHardMoney && (
        <Card>
          <SectionLabel>Hard money</SectionLabel>
          <div className="grid gap-3.5">
            <NumberField
              label="Points"
              value={inputs.points}
              onChange={(points) => onChange({ points })}
              suffix="%"
              step="0.25"
              hint="paid upfront"
              min={0}
            />
            <NumberField
              label="ARV (optional)"
              value={inputs.arv ?? 0}
              onChange={(n) => onChange({ arv: n > 0 ? n : null })}
              prefix="$"
              hint="after repair value"
              min={0}
            />
          </div>
          <p className="text-[11px] text-(--color-text-tertiary) mt-3">
            Interest-only. Full principal comes due as a balloon at term end.
          </p>
        </Card>
      )}

      {config.isDscr && (
        <Card>
          <SectionLabel>Property income</SectionLabel>
          <div className="grid gap-3.5">
            <NumberField
              label="Gross monthly rent"
              value={inputs.grossMonthlyRent}
              onChange={(grossMonthlyRent) => onChange({ grossMonthlyRent })}
              prefix="$"
              min={0}
            />
            <NumberField
              label="Vacancy rate"
              value={inputs.vacancyPct}
              onChange={(vacancyPct) => onChange({ vacancyPct })}
              suffix="%"
              step="0.5"
              min={0}
            />
            <NumberField
              label="Operating expenses"
              value={inputs.operatingExpensesMonthly}
              onChange={(operatingExpensesMonthly) => onChange({ operatingExpensesMonthly })}
              prefix="$"
              hint="monthly"
              min={0}
            />
            <NumberField
              label="DSCR threshold"
              value={inputs.dscrThreshold}
              onChange={(dscrThreshold) => onChange({ dscrThreshold })}
              step="0.05"
              hint="lender minimum"
              min={0}
            />
          </div>
        </Card>
      )}

      {/* ── Carrying costs ─────────────────────────────────────────────── */}
      <Card>
        <SectionLabel>Carrying costs</SectionLabel>
        <div className="grid gap-3.5">
          <NumberField
            label="Property tax"
            value={inputs.propertyTaxYearly}
            onChange={(propertyTaxYearly) => onChange({ propertyTaxYearly })}
            prefix="$"
            hint="per year"
            min={0}
          />
          <NumberField
            label="Home insurance"
            value={inputs.insuranceYearly}
            onChange={(insuranceYearly) => onChange({ insuranceYearly })}
            prefix="$"
            hint="per year"
            min={0}
          />
          <NumberField
            label="HOA"
            value={inputs.hoaMonthly}
            onChange={(hoaMonthly) => onChange({ hoaMonthly })}
            prefix="$"
            hint="per month"
            min={0}
          />
        </div>
      </Card>

      {config.showBorrowerIncome && (
        <Card>
          <SectionLabel>Affordability</SectionLabel>
          <div className="grid gap-3.5">
            <NumberField
              label="Gross monthly income"
              value={inputs.grossMonthlyIncome}
              onChange={(grossMonthlyIncome) => onChange({ grossMonthlyIncome })}
              prefix="$"
              min={0}
            />
            <NumberField
              label="Other monthly debt"
              value={inputs.otherMonthlyDebt}
              onChange={(otherMonthlyDebt) => onChange({ otherMonthlyDebt })}
              prefix="$"
              hint="car, student, cards"
              min={0}
            />
          </div>
        </Card>
      )}
    </div>
  );
}
