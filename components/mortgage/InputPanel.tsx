"use client";

import { useState } from "react";
import { type MortgageInputs } from "@/lib/mortgage/types";
import {
  LOAN_TYPE_CONFIG,
  LOAN_PRODUCTS,
  CONSERVATIVE_INSURANCE_RATE,
  DPA_AWARD,
  BORROWER_MINIMUM_INVESTMENT,
  allowsDownPaymentAssistance,
  productValueFor,
} from "@/lib/mortgage/loanTypes";
import { TERM_PRESETS, HARD_MONEY_TERM_PRESETS } from "@/lib/mortgage/defaults";
import {
  baseLoanAmount,
  downPaymentPercent,
  effectiveInsuranceYearly,
  isRenovationLoan,
  minimumDownPayment,
  totalAcquisitionCost,
  renovationFinanced,
} from "@/lib/mortgage/calculate";
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
import { MONTH_OPTIONS, dollars } from "./format";
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

  // The one basis both the percent box and its note work from. On a renovation
  // loan the down payment is a percent of price plus the work, so saying "of
  // $250,000" while measuring against $329,000 is how the two drifted apart.
  const acquisitionCost = totalAcquisitionCost(inputs);
  const downBasisNote = isRenovationLoan(inputs)
    ? `${downPercent.toFixed(1)}% of ${dollars(acquisitionCost, 0)} — price plus the work`
    : `${downPercent.toFixed(1)}% of ${dollars(inputs.homeValue, 0)}`;

  // With assistance on, the award covers the minimum, so the figure in the box
  // is not what the buyer brings. Saying so here is the difference between a
  // number that makes sense and one that looks wrong.
  const coveredByAssistance = inputs.dpaEnabled
    ? Math.min(DPA_AWARD, minimumDownPayment(inputs), Math.max(0, inputs.downPayment))
    : 0;

  return (
    <div className="grid gap-4" style={{ alignContent: "start" }}>
      <Card>
        <SectionLabel>Purchase</SectionLabel>
        <div className="grid gap-3.5">
          <SelectField
            label="Loan type"
            value={productValueFor(inputs.loanType, inputs.renovationProgram)}
            // One dropdown for what you're actually shopping for. The renovation
            // programs set two fields at once, and switching to a type that can't
            // use assistance clears it — otherwise the toggle disappears from the
            // form while the award is still quietly applied to the result.
            onChange={(v) => {
              const product = LOAN_PRODUCTS.find((p) => p.value === v);
              if (!product) return;
              onChange({
                loanType: product.loanType,
                renovationProgram: product.renovationProgram,
                dpaEnabled:
                  inputs.dpaEnabled && allowsDownPaymentAssistance(product.loanType),
              });
            }}
            options={LOAN_PRODUCTS.map((p) => ({ value: p.value, label: p.label }))}
          />

          <NumberField
            label="Sales price"
            value={inputs.homeValue}
            // Hold the down payment PERCENT steady as the price moves. Keeping the
            // dollar figure fixed instead makes the percentage jump on every
            // keystroke, which is what made this annoying to use.
            //
            // Measured against acquisition cost, like everything else here. Using
            // the price alone made the held-steady percentage drift on renovation
            // loans, where the two differ.
            onChange={(homeValue) => {
              const ratio = acquisitionCost > 0 ? inputs.downPayment / acquisitionCost : 0;
              const nextBasis = homeValue + renovationFinanced(inputs);
              onChange({ homeValue, downPayment: Math.round(nextBasis * ratio) });
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
                note={downBasisNote}
                min={0}
              />
            ) : (
              <NumberField
                label=""
                value={Number(downPercent.toFixed(2))}
                // Against total acquisition cost, which is what downPaymentPercent
                // displays. These used to disagree — typing 3.5% wrote 3.5% of the
                // price, then redisplayed it over price-plus-renovation and came
                // back as something smaller.
                onChange={(pct) => onChange({ downPayment: (acquisitionCost * pct) / 100 })}
                suffix="%"
                note={downBasisNote}
                min={0}
              />
            )}
            {coveredByAssistance > 0 && (
              <p className="text-[11px] text-(--color-accent) mt-1">
                {dollars(coveredByAssistance, 0)} covered by assistance — you pay{" "}
                {dollars(Math.max(0, inputs.downPayment - coveredByAssistance), 0)} of this.
              </p>
            )}
            {downPercent < config.minDownPercent && (
              <p className="text-[11px] text-(--color-warning) mt-1">
                {config.label} typically requires at least {config.minDownPercent}% down
                {isRenovationLoan(inputs) ? " of price plus the work" : ""}.
              </p>
            )}
          </div>

          {/* Assistance sits with the down payment because it is the same
              decision: who pays it. The award is fixed, so this is yes or no. */}
          {allowsDownPaymentAssistance(inputs.loanType) && (
            <div>
              <ToggleRow
                label={`Down payment assistance (${dollars(DPA_AWARD, 0)})`}
                checked={inputs.dpaEnabled}
                onChange={(dpaEnabled) => onChange({ dpaEnabled })}
              />
              <p className="text-[11px] text-(--color-text-tertiary) leading-relaxed mt-1">
                {inputs.dpaEnabled
                  ? `Covers the ${config.minDownPercent}% minimum first — ${dollars(minimumDownPayment(inputs), 0)} — and the rest goes to closing costs. You still bring at least ${dollars(BORROWER_MINIMUM_INVESTMENT, 0)} of your own.`
                  : "A fixed award that covers the minimum down payment, with the remainder applied to closing costs."}
              </p>
            </div>
          )}

          {inputs.renovationProgram !== "none" && (
            <>
              <NumberField
                label="Renovation cost"
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
