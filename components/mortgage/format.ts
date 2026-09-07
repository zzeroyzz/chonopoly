const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export function money(n: number, decimals = 0): string {
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function dollars(n: number, decimals = 0): string {
  const negative = n < 0;
  return `${negative ? "-" : ""}$${money(Math.abs(n), decimals)}`;
}

export function percent(n: number, decimals = 1): string {
  if (!Number.isFinite(n)) return "—";
  return `${n.toFixed(decimals)}%`;
}

/** "2025-02-01" -> "Feb 2025" */
export function monthYear(iso: string | null): string {
  if (!iso) return "—";
  const [y, m] = iso.split("-");
  const idx = Number(m) - 1;
  return `${MONTHS[idx] ?? "?"} ${y}`;
}

export const MONTH_OPTIONS = MONTHS.map((label, i) => ({ value: String(i), label }));
