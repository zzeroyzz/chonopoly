interface StatCardProps {
  label: string;
  value: string;
  subtext?: string;
  variant?: "default" | "success" | "danger" | "warning" | "muted";
}

export function StatCard({ label, value, subtext, variant = "default" }: StatCardProps) {
  const valueColor = {
    default: "var(--color-text-primary)",
    success: "var(--color-accent)",
    danger:  "var(--color-danger)",
    warning: "#f59e0b",
    muted:   "var(--color-text-tertiary)",
  }[variant];

  return (
    <div className="bg-(--color-elevated) border border-(--color-border-default) rounded-md px-4 py-3">
      <p className="text-[10px] uppercase tracking-widest text-(--color-text-tertiary) mb-1 font-medium">
        {label}
      </p>
      <p className="text-[22px] font-bold leading-tight" style={{ color: valueColor }}>
        {value}
      </p>
      {subtext && (
        <p className="text-[11px] mt-0.5 text-(--color-text-tertiary)">
          {subtext}
        </p>
      )}
    </div>
  );
}
