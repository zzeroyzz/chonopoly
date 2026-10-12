"use client";

import { useState } from "react";
import { type MortgageInputs, type LoanType } from "@/lib/mortgage/types";
import { LOAN_TYPE_CONFIG, LOAN_TYPES, CONSERVATIVE_INSURANCE_RATE } from "@/lib/mortgage/loanTypes";
import { TERM_PRESETS, HARD_MONEY_TERM_PRESETS } from "@/lib/mortgage/defaults";
import { baseLoanAmount, downPaymentPercent, effectiveInsuranceYearly } from "@/lib/mortgage/calculate";
import { ltvPercent, pmiBandForLtv, suggestedPmiRate, formatPmiBand } from "@/lib/mortgage/pmi";
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
import { PropertyTaxLookup } from "./PropertyTaxLookup";

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
            // Hold the down payment PERCENT steady as the price moves. Keeping the
            // dollar figure fixed instead makes the percentage jump on every
            // keystroke, which is what made this annoying to use.
            onChange={(homeValue) => {
              const pct = inputs.homeValue > 0 ? inputs.downPayment / inputs.homeValue : 0;
              onChange({ homeValue, downPayment: Math.round(homeValue * pct) });
            }}
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
                note={`${downPercent.toFixed(1)}% of $${Math.round(inputs.homeValue).toLocaleString()}`}
                min={0}
              />
            ) : (
              <NumberField
                label=""
                value={Number(downPercent.toFixed(2))}
                onChange={(pct) => onChange({ downPayment: (inputs.homeValue * pct) / 100 })}
                suffix="%"
                note={`$${Math.round(inputs.downPayment).toLocaleString()} of $${Math.round(inputs.homeValue).toLocaleString()}`}
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
            note={`${ltvPercent(derivedLoan, inputs.homeValue).toFixed(1)}% loan-to-value`}
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
      {config.showPmi && (() => {
        const ltv = ltvPercent(derivedLoan, inputs.homeValue);
        const band = pmiBandForLtv(ltv);
        const shown = inputs.pmiRateAuto ? suggestedPmiRate(ltv) : inputs.pmiRate;

        return (
          <Card>
            <SectionLabel>Mortgage insurance</SectionLabel>
            <NumberField
              label="PMI rate"
              value={shown}
              // Typing sets the rate manually — a real quote always beats a band midpoint.
              onChange={(pmiRate) => onChange({ pmiRate, pmiRateAuto: false })}
              suffix="%/yr"
              step="0.01"
              hint={downPercent >= 20 ? "not charged at 20%+ down" : "of loan amount"}
              min={0}
            />
            {band && downPercent < 20 && (
              <p className="text-[11px] text-(--color-text-tertiary) mt-2 leading-relaxed">
                At {ltv.toFixed(1)}% LTV the typical range is {formatPmiBand(band)}. Rates vary with
                credit score, so this is an estimate — enter your quoted rate if you have one.
                {!inputs.pmiRateAuto && (
                  <>
                    {" "}
                    <button
                      type="button"
                      onClick={() => onChange({ pmiRateAuto: true })}
                      className="text-(--color-accent)"
                    >
                      Use the estimate
                    </button>
                  </>
                )}
              </p>
            )}
          </Card>
        );
      })()}

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
          <div>
            <NumberField
              label="Property tax"
              value={inputs.propertyTaxYearly}
              onChange={(propertyTaxYearly) => onChange({ propertyTaxYearly })}
              prefix="$"
              hint="per year"
              min={0}
            />
            <PropertyTaxLookup
              homeValue={inputs.homeValue}
              onApply={(propertyTaxYearly) => onChange({ propertyTaxYearly })}
            />
          </div>
          <div>
            <NumberField
              label="Home insurance"
              value={Math.round(effectiveInsuranceYearly(inputs))}
              onChange={(insuranceYearly) =>
                onChange({ insuranceYearly, insuranceRateAuto: false })
              }
              prefix="$"
              hint="per year"
              min={0}
            />
            <p className="text-[11px] text-(--color-text-tertiary) mt-1 leading-relaxed">
              {inputs.insuranceRateAuto ? (
                <>
                  Estimated at {CONSERVATIVE_INSURANCE_RATE}% of home value — deliberately on the
                  high side. Enter your quote to replace it.
                </>
              ) : (
                <>
                  Your figure.{" "}
                  <button
                    type="button"
                    onClick={() => onChange({ insuranceRateAuto: true })}
                    className="text-(--color-accent)"
                  >
                    Use the estimate
                  </button>
                </>
              )}
            </p>
          </div>
          <NumberField
            label="HOA"
            value={inputs.hoaMonthly}
            onChange={(hoaMonthly) => onChange({ hoaMonthly })}
            prefix="$"
            hint="per month"
            min={0}
          />

          <NumberField
            label="Closing costs"
            value={inputs.closingCostPercent}
            onChange={(closingCostPercent) => onChange({ closingCostPercent })}
            suffix="%"
            hint="of price"
            note={`$${Math.round((inputs.homeValue * inputs.closingCostPercent) / 100).toLocaleString()} — paid once, not part of the monthly payment`}
            min={0}
          />
        </div>
      </Card>

      {(inputs.loanType === "fha" || inputs.loanType === "conventional") && (
        <Card>
          <SectionLabel>Renovation financing</SectionLabel>
          <div className="grid gap-3.5">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] uppercase tracking-widest text-(--color-text-tertiary) font-medium">
                  Program
                </span>
                <SegmentedControl
                  ariaLabel="Renovation program"
                  value={inputs.renovationProgram}
                  onChange={(renovationProgram) => onChange({ renovationProgram })}
                  options={
                    inputs.loanType === "fha"
                      ? [
                          { value: "none", label: "None" },
                          { value: "fha203k", label: "203(k)" },
                        ]
                      : [
                          { value: "none", label: "None" },
                          { value: "homestyle", label: "HomeStyle" },
                        ]
                  }
                />
              </div>
              <p className="text-[11px] text-(--color-text-tertiary) leading-relaxed">
                {inputs.renovationProgram === "none"
                  ? "Finance the work into the mortgage instead of paying for it separately."
                  : "The loan is sized on price plus the work, and measured against the finished value."}
              </p>
            </div>

            {inputs.renovationProgram !== "none" && (
              <>
                <NumberField
                  label="Renovation budget"
                  value={inputs.renovationBudget}
                  onChange={(renovationBudget) => onChange({ renovationBudget })}
                  prefix="$"
                  hint="hard costs"
                  min={0}
                />
                <NumberField
                  label="Contingency reserve"
                  value={inputs.renovationContingencyPct}
                  onChange={(renovationContingencyPct) => onChange({ renovationContingencyPct })}
                  suffix="%"
                  hint="of budget"
                  note={`$${Math.round((inputs.renovationBudget * inputs.renovationContingencyPct) / 100).toLocaleString()} held back. Lenders require one; the amount varies by program and condition.`}
                  min={0}
                />
                <NumberField
                  label="After-repair value"
                  value={inputs.afterRepairValue ?? 0}
                  onChange={(n) => onChange({ afterRepairValue: n > 0 ? n : null })}
                  prefix="$"
                  hint="as completed"
                  note="Your number, from comps or an as-completed appraisal. Left blank, the price is used instead — which overstates mortgage insurance rather than understating it."
                  min={0}
                />
              </>
            )}
          </div>
        </Card>
      )}

      <Card>
        <SectionLabel>Down payment assistance</SectionLabel>
        <div className="grid gap-3.5">
          <NumberField
            label="Assistance amount"
            value={inputs.dpaAmount}
            onChange={(dpaAmount) => onChange({ dpaAmount })}
            prefix="$"
            hint="award"
            note="Reduces cash at closing. The first mortgage is unchanged, so PMI is unchanged too."
            min={0}
          />

          {inputs.dpaAmount > 0 && (
            <>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] uppercase tracking-widest text-(--color-text-tertiary) font-medium">
                    Repayment
                  </span>
                  <SegmentedControl
                    ariaLabel="Assistance structure"
                    value={inputs.dpaStructure}
                    onChange={(dpaStructure) => onChange({ dpaStructure })}
                    options={[
                      { value: "grant", label: "Forgiven" },
                      { value: "deferred", label: "Deferred" },
                      { value: "amortizing", label: "Monthly" },
                    ]}
                  />
                </div>
                <p className="text-[11px] text-(--color-text-tertiary) leading-relaxed">
                  {inputs.dpaStructure === "grant"
                    ? "Forgiven outright, or after a residency period. No payment, no effect on what you qualify for."
                    : inputs.dpaStructure === "deferred"
                      ? "No monthly payment — the balance comes due when you sell, refinance or pay off."
                      : "A second mortgage with a payment from day one. It counts against your ratios like any other debt."}
                </p>
              </div>

              {inputs.dpaStructure === "amortizing" && (
                <div className="grid grid-cols-2 gap-3">
                  <NumberField
                    label="Rate"
                    value={inputs.dpaRate}
                    onChange={(dpaRate) => onChange({ dpaRate })}
                    suffix="%"
                    hint="0% is common"
                    min={0}
                  />
                  <NumberField
                    label="Term"
                    value={inputs.dpaTermYears}
                    onChange={(dpaTermYears) => onChange({ dpaTermYears })}
                    suffix="yr"
                    min={1}
                  />
                </div>
              )}
            </>
          )}
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
