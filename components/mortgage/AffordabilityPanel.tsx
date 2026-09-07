"use client";

import { type DtiResult, type RatioStatus } from "@/lib/mortgage/types";
import { Card, SectionLabel } from "./fields";
import { percent } from "./format";

const STATUS_COLOR: Record<RatioStatus, string> = {
  pass: "var(--color-accent)",
  caution: "var(--color-warning)",
  fail: "var(--color-danger)",
};

const STATUS_LABEL: Record<RatioStatus, string> = {
  pass: "Pass",
  caution: "Caution",
  fail: "Over",
};

function Ratio({
  label,
  value,
  guideline,
  status,
}: {
  label: string;
  value: number;
  guideline: number | null;
  status: RatioStatus;
}) {
  const color = STATUS_COLOR[status];
  // Bar is scaled against 60% so a ratio well over guideline still reads on screen.
  const width = Math.min(100, (value / 60) * 100);
  const marker = guideline === null ? null : Math.min(100, (guideline / 60) * 100);

  return (
    <div className="py-2">
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="text-[12px] text-(--color-text-secondary)">{label}</span>
        <span className="text-[13px] font-(--font-mono)" style={{ color }}>
          {percent(value)}
          {guideline !== null && (
            <span className="text-(--color-text-tertiary)"> / {guideline}%</span>
          )}
        </span>
      </div>
      <div className="relative h-1.5 rounded-full bg-(--color-border-default) overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${width}%`, background: color }} />
      </div>
      {marker !== null && (
        <div className="relative h-0">
          <div
            className="absolute -top-1.5 w-px h-1.5 bg-(--color-text-tertiary)"
            style={{ left: `${marker}%` }}
          />
        </div>
      )}
      <p className="text-[10px] uppercase tracking-widest mt-1.5" style={{ color }}>
        {STATUS_LABEL[status]}
      </p>
    </div>
  );
}

export function AffordabilityPanel({ dti }: { dti: DtiResult }) {
  if (!dti.applicable) return null;

  return (
    <Card>
      <SectionLabel>Affordability</SectionLabel>
      <Ratio
        label="Front-end (housing)"
        value={dti.frontEnd}
        guideline={dti.frontGuideline}
        status={dti.frontStatus}
      />
      <Ratio
        label="Back-end (all debt)"
        value={dti.backEnd}
        guideline={dti.backGuideline}
        status={dti.backStatus}
      />
      {dti.note && (
        <p className="text-[11px] text-(--color-text-tertiary) mt-2 leading-relaxed">{dti.note}</p>
      )}
    </Card>
  );
}
