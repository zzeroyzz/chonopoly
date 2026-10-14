"use client";

import { useState } from "react";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { PieChart as PieIcon, BarChart2 } from "lucide-react";
import { getCategoryMeta, formatMoney } from "./types";

interface Props {
  spending: Record<string, number>;
}

const tooltipStyle = {
  contentStyle: { background: "var(--color-elevated)", border: "1px solid var(--color-border-strong)", borderRadius: 10, color: "#fff", fontSize: 12 },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  formatter: (value: any) => [`$${formatMoney(Number(value))}`, ""],
};

interface TooltipState { name: string; value: number; hex: string; x: number; y: number }

const BAR_W = 480;
const BAR_H = 280;

export default function SpendingChart({ spending }: Props) {
  const [chartType, setChartType] = useState<"pie" | "bar">("pie");
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  const data = Object.entries(spending)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([key, value]) => {
      const m = getCategoryMeta(key);
      return { name: m.label, value: Math.round(value * 100) / 100, hex: m.hex };
    });

  if (data.length === 0) return null;

  const total = data.reduce((s, d) => s + d.value, 0);

  const toggles = (
    <div className="flex justify-end gap-1 mb-1 shrink-0">
      <button onClick={() => setChartType("pie")} aria-label="Pie chart"
        className={`p-1.5 rounded-lg transition-colors ${chartType === "pie" ? "bg-(--color-border-default) text-(--color-text-primary)" : "text-(--color-text-secondary) hover:text-(--color-text-primary)"}`}>
        <PieIcon size={14} />
      </button>
      <button onClick={() => setChartType("bar")} aria-label="Bar chart"
        className={`p-1.5 rounded-lg transition-colors ${chartType === "bar" ? "bg-(--color-border-default) text-(--color-text-primary)" : "text-(--color-text-secondary) hover:text-(--color-text-primary)"}`}>
        <BarChart2 size={14} />
      </button>
    </div>
  );

  if (chartType === "bar") {
    return (
      <div className="flex flex-col h-full">
        {toggles}
        <div className="overflow-x-auto">
          <BarChart width={BAR_W} height={BAR_H} data={data} margin={{ top: 5, right: 10, left: 5, bottom: 70 }}>
            <XAxis dataKey="name" tick={{ fill: "#55556A", fontSize: 10 }} angle={-40} textAnchor="end" interval={0} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: "#55556A", fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${v}`} width={52} />
            <Tooltip {...tooltipStyle} />
            <Bar dataKey="value" radius={[4, 4, 0, 0]}>
              {data.map((entry, i) => <Cell key={i} fill={entry.hex} />)}
            </Bar>
          </BarChart>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col lg:flex-1 lg:min-h-0">
      {toggles}

      {/* Mobile: total spent above chart — no overlay on the donut */}
      <div className="lg:hidden text-center mb-2 shrink-0">
        <p className="text-[9px] text-(--color-text-tertiary) uppercase tracking-widest">Total spent</p>
        <p className="text-lg font-semibold" style={{ fontFamily: "var(--font-display)" }}>${formatMoney(total)}</p>
      </div>

      <div className="relative h-50 lg:h-auto lg:flex-1 flex items-center justify-center" onMouseLeave={() => setTooltip(null)}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              innerRadius="64%"
              outerRadius="100%"
              paddingAngle={2}
              dataKey="value"
              strokeWidth={1}
              stroke="#0A0A0F"
              onMouseEnter={(_entry, index, e) => {
                const ev = e as unknown as MouseEvent;
                const d = data[index];
                if (d) setTooltip({ name: d.name, value: d.value, hex: d.hex, x: ev.clientX, y: ev.clientY });
              }}
              onMouseMove={(_entry, _index, e) => {
                const ev = e as unknown as MouseEvent;
                setTooltip((prev) => prev ? { ...prev, x: ev.clientX, y: ev.clientY } : prev);
              }}
              onMouseLeave={() => setTooltip(null)}
            >
              {data.map((entry, i) => <Cell key={i} fill={entry.hex} />)}
            </Pie>
          </PieChart>
        </ResponsiveContainer>

        {/* Desktop: total spent centered inside donut */}
        <div className="hidden lg:flex absolute inset-0 items-center justify-center pointer-events-none">
          <div className="text-center">
            <p className="text-[9px] text-(--color-text-tertiary) uppercase tracking-widest">Total spent</p>
            <p className="text-lg font-semibold" style={{ fontFamily: "var(--font-display)" }}>${formatMoney(total)}</p>
          </div>
        </div>
      </div>

      {tooltip && (
        <div
          className="fixed z-50 pointer-events-none px-3 py-2 bg-[#1e1e24] border border-[#2e2e38] rounded-lg shadow-xl text-xs"
          style={{ left: tooltip.x + 14, top: tooltip.y - 10 }}
        >
          <div className="flex items-center gap-2 mb-0.5">
            <div className="w-2 h-2 rounded-full shrink-0" style={{ background: tooltip.hex }} />
            <span className="text-white font-medium">{tooltip.name}</span>
          </div>
          <p className="text-[#7a7870] font-(--font-mono)">${formatMoney(tooltip.value)}</p>
        </div>
      )}

      <div className="mt-2 grid grid-cols-1 lg:grid-cols-2 gap-x-3 gap-y-1 shrink-0">
        {data.map((entry, i) => (
          <div key={i} className="flex items-center gap-2 min-w-0">
            <div className="w-2 h-2 rounded-full shrink-0" style={{ background: entry.hex }} />
            <span className="text-[10px] text-[#c8c5bc] truncate flex-1">{entry.name}</span>
            <span className="text-[10px] font-(--font-mono) text-[#7a7870] shrink-0">${formatMoney(entry.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
