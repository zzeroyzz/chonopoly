"use client";

import { useState } from "react";
import { Plus, X, AlertTriangle } from "lucide-react";
import { type DealLine, LINE_SOURCE_LABEL } from "@/lib/mortgage/flip";
import { type BuiltDeal } from "@/lib/deal/buildDeal";
import { type OtherFee } from "@/lib/mortgage/flip";
import { Card, SectionLabel, NumberField } from "./fields";
import { dollars } from "./format";

/**
 * What the deal makes.
 *
 * Walk-away cash is the headline because it is the money that buys the next
 * house. True profit sits right under it because walk-away flatters a deal
 * where you brought $40,000 and carried it a year.
 *
 * Every line says where it came from. These numbers get argued with at an offer
 * deadline, and one you cannot trace is one you cannot defend.
 */

export interface ProfitCardEdits {
  holdMonths?: number;
  capitalGains?: number;
  monthlyExtras?: number;
  sellerClosingCosts?: number;
  dpaRepayment?: number;
  loanPayoff?: number;
  otherFees?: OtherFee[];
}

interface Props {
  built: BuiltDeal;
  edits: ProfitCardEdits;
  onChange: (edits: ProfitCardEdits) => void;
  /** Hidden on /tools/flip, which has no house to save to. */
  onSave?: () => void;
  saving?: boolean;
  /** What is missing, when there is no ARV to work from. */
  missingArvNote?: string;
}

function Line({
  label,
  line,
  negative = false,
  onOverride,
  onClear,
}: {
  label: string;
  line: DealLine;
  negative?: boolean;
  onOverride?: (value: number) => void;
  onClear?: () => void;
}) {
  const [editing, setEditing] = useState(false);

  return (
    <div className="py-1.5 border-b border-(--color-border-subtle) last:border-0">
      <div className="flex items-baseline gap-2">
        <span className="flex-1 min-w-0 text-[12px] text-(--color-text-secondary)">
          {negative && "− "}
          {label}
        </span>
        {onOverride && editing ? (
          <input
            autoFocus
            type="text"
            inputMode="decimal"
            defaultValue={String(Math.round(line.value))}
            onBlur={(e) => {
              const n = Number(e.target.value.replace(/[^0-9.-]/g, ""));
              if (Number.isFinite(n)) onOverride(n);
              setEditing(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") setEditing(false);
            }}
            className="w-28 h-7 rounded-md bg-(--color-elevated) border border-(--color-accent) px-2 text-[13px] text-right font-(--font-mono) text-(--color-text-primary) focus:outline-none"
          />
        ) : (
          <button
            type="button"
            disabled={!onOverride}
            onClick={() => setEditing(true)}
            className={`text-[13px] font-(--font-mono) shrink-0 ${
              onOverride ? "text-(--color-text-primary) underline-offset-4 hover:underline" : "text-(--color-text-primary)"
            }`}
          >
            {dollars(line.value, 0)}
          </button>
        )}
      </div>
      <div className="flex items-center gap-1.5 mt-0.5">
        <span
          className={`text-[10px] ${
            line.overridden ? "text-(--color-warning)" : "text-(--color-text-tertiary)"
          }`}
        >
          {line.overridden ? "overridden" : LINE_SOURCE_LABEL[line.source]}
        </span>
        {line.overridden && onClear && (
          <button
            type="button"
            onClick={onClear}
            className="text-[10px] text-(--color-accent)"
          >
            reset
          </button>
        )}
        {line.note && !line.overridden && (
          <span className="text-[10px] text-(--color-text-tertiary)">· {line.note}</span>
        )}
      </div>
    </div>
  );
}

function Headline({
  label,
  value,
  tone,
  testId,
}: {
  label: string;
  value: number | null;
  tone: "primary" | "secondary";
  testId: string;
}) {
  const missing = value === null;
  return (
    <div className={tone === "primary" ? "mb-3" : ""}>
      <p className="text-[10px] uppercase tracking-widest text-(--color-text-tertiary)">
        {label}
      </p>
      <p
        data-testid={testId}
        className={`font-(--font-mono) ${
          tone === "primary" ? "text-[28px]" : "text-[18px]"
        } ${
          missing
            ? "text-(--color-text-tertiary)"
            : value < 0
              ? "text-(--color-danger)"
              : tone === "primary"
                ? "text-(--color-accent)"
                : "text-(--color-text-primary)"
        }`}
      >
        {missing ? "—" : dollars(value, 0)}
      </p>
    </div>
  );
}

export function ProfitCard({
  built,
  edits,
  onChange,
  onSave,
  saving = false,
  missingArvNote,
}: Props) {
  const { params, result, hardMoney, holdMonths } = built;
  const set = (patch: ProfitCardEdits) => onChange({ ...edits, ...patch });

  const fees = edits.otherFees ?? [];
  const setFees = (next: OtherFee[]) => set({ otherFees: next });

  return (
    <Card>
      <SectionLabel>What this deal makes</SectionLabel>

      {result.missingArv ? (
        <div
          data-testid="profit-no-arv"
          className="rounded-md border border-(--color-border-default) px-3 py-2 mb-3"
        >
          <p className="text-[12px] text-(--color-text-primary) mb-0.5">
            No ARV yet, so there is nothing to work back from.
          </p>
          <p className="text-[11px] text-(--color-text-secondary) leading-relaxed">
            {missingArvNote ?? "Add comps on the Comps tab and tick the renovated ones."}
          </p>
        </div>
      ) : null}

      <Headline label="Walk-away cash" value={result.walkAwayCash} tone="primary" testId="walk-away" />
      <Headline label="True profit" value={result.trueProfit} tone="secondary" testId="true-profit" />

      {result.trueProfit !== null && result.walkAwayCash !== null && (
        <p className="text-[11px] text-(--color-text-secondary) leading-relaxed mt-1 mb-3">
          You leave closing with {dollars(result.walkAwayCash, 0)}. After the{" "}
          {dollars(result.cashIn, 0)} you put in and {dollars(result.holdingCost, 0)} of
          carry, the deal made {dollars(result.trueProfit, 0)}
          {result.roiPct !== null && ` — ${result.roiPct.toFixed(0)}% on your cash`}.
        </p>
      )}

      {hardMoney?.loan.capped && (
        <div
          data-testid="loan-capped"
          className="flex items-start gap-2 rounded-md border border-(--color-warning) px-3 py-2 mb-3"
        >
          <AlertTriangle size={13} className="shrink-0 mt-0.5 text-(--color-warning)" />
          <p className="text-[11px] text-(--color-text-secondary) leading-relaxed">
            The loan hit the {hardMoney.terms.maxLoanToArvPct}% of ARV ceiling
            ({dollars(hardMoney.loan.arvCeiling, 0)}). {dollars(hardMoney.loan.shortfall, 0)}{" "}
            you expected to borrow is cash you have to bring.
          </p>
        </div>
      )}

      {/* ── Out of the closing statement ────────────────────────────────── */}
      <p className="text-[10px] uppercase tracking-widest text-(--color-text-tertiary) mt-4 mb-1">
        At closing
      </p>
      {params.arv && <Line label="ARV" line={params.arv} />}
      <Line
        label="Loan payoff at sale"
        line={params.loanPayoff}
        negative
        onOverride={(v) => set({ loanPayoff: v })}
        onClear={() => set({ loanPayoff: undefined })}
      />
      <Line
        label="Seller closing costs"
        line={params.sellerClosingCosts}
        negative
        onOverride={(v) => set({ sellerClosingCosts: v })}
        onClear={() => set({ sellerClosingCosts: undefined })}
      />
      <Line
        label="DPA repayment"
        line={params.dpaRepayment}
        negative
        onOverride={(v) => set({ dpaRepayment: v })}
        onClear={() => set({ dpaRepayment: undefined })}
      />
      <Line
        label="Capital gains"
        line={params.capitalGains}
        negative
        onOverride={(v) => set({ capitalGains: v })}
        onClear={() => set({ capitalGains: undefined })}
      />

      {/* Other fees: a named list, because "misc $3,400" is unauditable. */}
      <div className="py-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[12px] text-(--color-text-secondary)">− Other fees</span>
          <span className="text-[13px] font-(--font-mono) text-(--color-text-primary)">
            {dollars(result.otherFeesTotal, 0)}
          </span>
        </div>
        {fees.map((fee, i) => (
          <div key={i} className="flex items-center gap-2 mt-1.5">
            <input
              value={fee.name}
              onChange={(e) => {
                const next = [...fees];
                next[i] = { ...fee, name: e.target.value };
                setFees(next);
              }}
              placeholder="What for"
              data-testid={`fee-name-${i}`}
              className="flex-1 min-w-0 h-8 rounded-md bg-(--color-elevated) border border-(--color-border-default) px-2 text-[12px] text-(--color-text-primary) focus:outline-none focus:border-(--color-accent)"
            />
            <input
              value={String(fee.amount)}
              onChange={(e) => {
                const n = Number(e.target.value.replace(/[^0-9.-]/g, ""));
                const next = [...fees];
                next[i] = { ...fee, amount: Number.isFinite(n) ? n : 0 };
                setFees(next);
              }}
              inputMode="decimal"
              data-testid={`fee-amount-${i}`}
              className="w-24 h-8 rounded-md bg-(--color-elevated) border border-(--color-border-default) px-2 text-[12px] text-right font-(--font-mono) text-(--color-text-primary) focus:outline-none focus:border-(--color-accent)"
            />
            <button
              type="button"
              onClick={() => setFees(fees.filter((_, j) => j !== i))}
              aria-label={`Remove ${fee.name || "fee"}`}
              className="shrink-0 p-1 text-(--color-text-tertiary) hover:text-(--color-danger)"
            >
              <X size={13} />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setFees([...fees, { name: "", amount: 0 }])}
          data-testid="add-fee"
          className="inline-flex items-center gap-1 mt-2 text-[11px] text-(--color-accent)"
        >
          <Plus size={11} /> Add a fee
        </button>
      </div>

      {/* ── Out of pocket ───────────────────────────────────────────────── */}
      <p className="text-[10px] uppercase tracking-widest text-(--color-text-tertiary) mt-4 mb-1">
        Cash in · {dollars(result.cashIn, 0)}
      </p>
      <Line label="Down payment" line={params.downPayment} negative />
      <Line label="Buyer closing costs" line={params.buyerClosingCosts} negative />
      <Line label="Points" line={params.points} negative />
      <Line label="Rehab paid in cash" line={params.rehabPaidInCash} negative />
      {params.loanShortfall.value > 0 && (
        <Line label="Loan ceiling shortfall" line={params.loanShortfall} negative />
      )}

      {/* ── Carry ───────────────────────────────────────────────────────── */}
      <p className="text-[10px] uppercase tracking-widest text-(--color-text-tertiary) mt-4 mb-1">
        Holding · {dollars(result.holdingCost, 0)}
      </p>
      <div className="grid grid-cols-2 gap-2 mb-2">
        <NumberField
          label="Hold (months)"
          testId="hold-months"
          value={holdMonths}
          onChange={(n) => set({ holdMonths: n })}
          min={0}
        />
        <NumberField
          label="Monthly extras"
          testId="monthly-extras"
          value={edits.monthlyExtras ?? 0}
          onChange={(n) => set({ monthlyExtras: n })}
          prefix="$"
          min={0}
        />
      </div>
      <Line label="Carry over the hold" line={params.carry} negative />
      <Line label="Monthly extras × months" line={{ ...params.monthlyExtras, value: params.monthlyExtras.value * holdMonths }} negative />

      <p
        data-testid="one-more-month"
        className="text-[11px] text-(--color-text-secondary) mt-2 leading-relaxed"
      >
        One more month costs {dollars(result.oneMoreMonth, 0)}
        {result.trueProfit !== null &&
          ` — true profit would be ${dollars(result.trueProfit - result.oneMoreMonth, 0)}`}
        .
      </p>

      {/* ── The hard money interest table ───────────────────────────────── */}
      {hardMoney && hardMoney.schedule.rows.length > 0 && (
        <div className="mt-4">
          <p className="text-[10px] uppercase tracking-widest text-(--color-text-tertiary) mb-1">
            Interest · {hardMoney.terms.interestStyle === "dutch" ? "Dutch" : "Non-Dutch"}
          </p>
          <div className="overflow-x-auto" data-testid="interest-table">
            <table className="w-full text-[11px] font-(--font-mono)">
              <thead>
                <tr className="text-(--color-text-tertiary)">
                  <th className="text-left font-normal py-1">Mo</th>
                  <th className="text-right font-normal py-1">Drawn</th>
                  <th className="text-right font-normal py-1">Balance</th>
                  <th className="text-right font-normal py-1">Interest</th>
                </tr>
              </thead>
              <tbody>
                {hardMoney.schedule.rows.map((r) => (
                  <tr key={r.month} className="border-t border-(--color-border-subtle)">
                    <td className="py-1 text-(--color-text-secondary)">{r.month}</td>
                    <td className="py-1 text-right text-(--color-text-secondary)">
                      {r.drawn > 0 ? dollars(r.drawn, 0) : "—"}
                    </td>
                    <td className="py-1 text-right text-(--color-text-secondary)">
                      {dollars(r.balance, 0)}
                    </td>
                    <td className="py-1 text-right text-(--color-text-primary)">
                      {dollars(r.interest, 0)}
                    </td>
                  </tr>
                ))}
                <tr className="border-t border-(--color-border-default)">
                  <td className="py-1 text-(--color-text-secondary)" colSpan={3}>
                    Total
                  </td>
                  <td className="py-1 text-right text-(--color-text-primary)">
                    {dollars(hardMoney.schedule.total, 0)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {onSave && (
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          data-testid="save-profit"
          className="w-full h-10 mt-4 rounded-md bg-(--color-accent) text-[13px] font-medium text-(--color-base) disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save this analysis"}
        </button>
      )}
    </Card>
  );
}
