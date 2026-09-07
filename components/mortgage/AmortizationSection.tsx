"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { type MortgageResult, type AmortizationRow } from "@/lib/mortgage/types";
import { toAnnualRows } from "@/lib/mortgage/amortization";
import { Card } from "./fields";
import { dollars, monthYear } from "./format";

function MonthRow({ row }: { row: AmortizationRow }) {
  const flagged = row.isMortgageInsuranceEnd || row.isBalloon;
  return (
    <div
      className={`py-2 pl-3 ${flagged ? "border-l-2 border-(--color-accent)" : "border-l-2 border-transparent"}`}
    >
      <div className="flex items-baseline justify-between">
        <span className="text-[12px] text-(--color-text-secondary)">{monthYear(row.date)}</span>
        <span className="text-[12px] font-(--font-mono) text-(--color-text-primary)">
          {dollars(row.payment + row.mortgageInsurance, 0)}
        </span>
      </div>
      <div className="flex items-baseline justify-between mt-0.5 text-[11px] text-(--color-text-tertiary) font-(--font-mono)">
        <span>
          P {dollars(row.principal, 0)} · I {dollars(row.interest, 0)}
          {row.mortgageInsurance > 0 && <> · MI {dollars(row.mortgageInsurance, 0)}</>}
        </span>
        <span>{dollars(row.balance, 0)}</span>
      </div>
      {row.isBalloon && (
        <p className="text-[10px] uppercase tracking-widest text-(--color-danger) mt-1">Balloon — full principal due</p>
      )}
      {row.isMortgageInsuranceEnd && !row.isBalloon && (
        <p className="text-[10px] uppercase tracking-widest text-(--color-accent) mt-1">
          Mortgage insurance ends
        </p>
      )}
    </div>
  );
}

export function AmortizationSection({ result }: { result: MortgageResult }) {
  const [open, setOpen] = useState(false);
  const [expandedYears, setExpandedYears] = useState<Record<number, boolean>>({});

  const annual = useMemo(() => toAnnualRows(result.schedule), [result.schedule]);

  if (result.schedule.length === 0) return null;

  return (
    <Card>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between text-left"
      >
        <span className="text-[9px] uppercase tracking-[0.1em] text-(--color-text-tertiary)">
          Amortization schedule
        </span>
        <span className="flex items-center gap-1.5 text-[12px] text-(--color-text-secondary)">
          {result.schedule.length} payments
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>
      </button>

      {open && (
        <div className="mt-4">
          {/* Desktop table */}
          <div className="hidden lg:block">
            <div className="grid grid-cols-6 gap-2 pb-2 border-b border-(--color-border-default) text-[10px] uppercase tracking-widest text-(--color-text-tertiary)">
              <span>Year</span>
              <span className="text-right">Payment</span>
              <span className="text-right">Principal</span>
              <span className="text-right">Interest</span>
              <span className="text-right">MI</span>
              <span className="text-right">Balance</span>
            </div>
            {annual.map((y) => {
              const expanded = expandedYears[y.year] ?? false;
              return (
                <div key={y.year}>
                  <button
                    type="button"
                    onClick={() => setExpandedYears((p) => ({ ...p, [y.year]: !expanded }))}
                    className={`w-full grid grid-cols-6 gap-2 py-2 text-[12px] font-(--font-mono) text-left border-b border-(--color-border-subtle) hover:text-(--color-text-primary) transition-colors ${
                      y.containsMortgageInsuranceEnd || y.containsBalloon
                        ? "text-(--color-accent)"
                        : "text-(--color-text-secondary)"
                    }`}
                  >
                    <span className="flex items-center gap-1">
                      {expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                      {y.year}
                    </span>
                    <span className="text-right">{dollars(y.payment + y.mortgageInsurance, 0)}</span>
                    <span className="text-right">{dollars(y.principal, 0)}</span>
                    <span className="text-right">{dollars(y.interest, 0)}</span>
                    <span className="text-right">{y.mortgageInsurance > 0 ? dollars(y.mortgageInsurance, 0) : "—"}</span>
                    <span className="text-right">{dollars(y.balance, 0)}</span>
                  </button>
                  {expanded &&
                    y.months.map((m) => (
                      <div
                        key={m.period}
                        className={`grid grid-cols-6 gap-2 py-1.5 pl-5 text-[11px] font-(--font-mono) border-b border-(--color-border-subtle) ${
                          m.isMortgageInsuranceEnd || m.isBalloon
                            ? "text-(--color-accent)"
                            : "text-(--color-text-tertiary)"
                        }`}
                      >
                        <span>{monthYear(m.date)}</span>
                        <span className="text-right">{dollars(m.payment + m.mortgageInsurance, 0)}</span>
                        <span className="text-right">{dollars(m.principal, 0)}</span>
                        <span className="text-right">{dollars(m.interest, 0)}</span>
                        <span className="text-right">{m.mortgageInsurance > 0 ? dollars(m.mortgageInsurance, 0) : "—"}</span>
                        <span className="text-right">{dollars(m.balance, 0)}</span>
                      </div>
                    ))}
                </div>
              );
            })}
          </div>

          {/* Mobile — six columns don't fit at 390px, so each row is a stacked card */}
          <div className="lg:hidden divide-y divide-(--color-border-subtle)">
            {annual.map((y) => {
              const expanded = expandedYears[y.year] ?? false;
              return (
                <div key={y.year} className="py-1">
                  <button
                    type="button"
                    onClick={() => setExpandedYears((p) => ({ ...p, [y.year]: !expanded }))}
                    className={`w-full text-left py-2 ${
                      y.containsMortgageInsuranceEnd || y.containsBalloon
                        ? "border-l-2 border-(--color-accent) pl-3"
                        : "pl-3 border-l-2 border-transparent"
                    }`}
                  >
                    <div className="flex items-baseline justify-between">
                      <span className="flex items-center gap-1 text-[13px] text-(--color-text-primary) font-medium">
                        {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                        {y.year}
                      </span>
                      <span className="text-[13px] font-(--font-mono) text-(--color-text-primary)">
                        {dollars(y.payment + y.mortgageInsurance, 0)}
                      </span>
                    </div>
                    <div className="flex items-baseline justify-between mt-0.5 text-[11px] text-(--color-text-tertiary) font-(--font-mono)">
                      <span>
                        P {dollars(y.principal, 0)} · I {dollars(y.interest, 0)}
                      </span>
                      <span>{dollars(y.balance, 0)}</span>
                    </div>
                  </button>
                  {expanded && (
                    <div className="pl-2 divide-y divide-(--color-border-subtle)">
                      {y.months.map((m) => (
                        <MonthRow key={m.period} row={m} />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </Card>
  );
}
