"use client";

import { useEffect, useRef } from "react";
import { Building2, Home, ShieldCheck, Sparkles, Trophy, TrendingUp, Wallet } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface GoalOption {
  id: string;
  title: string;
  target_amount: number;
  current_balance: number;
}

interface BadgeDefProps {
  earnedKeys: Set<string>;
  netWorth: { net_worth: number } | null;
  monthTotalIncome: number;
  monthTotalSpent: number;
  goalOptions: GoalOption[];
  healthScore: number;
}

interface BadgeDef {
  key: string;
  label: string;
  description: string;
  Icon: React.ComponentType<{ size?: number; className?: string; style?: React.CSSProperties }>;
  unlocked: (p: BadgeDefProps) => boolean;
}

// ─── Badge definitions ────────────────────────────────────────────────────────

const LADDER_DEFS: BadgeDef[] = [
  {
    key: "bank_connected",
    label: "First Link",
    description: "Connect your first bank account",
    Icon: Building2,
    unlocked: ({ earnedKeys }) => earnedKeys.has("bank_connected"),
  },
  {
    key: "down_payment_funded",
    label: "Down Payment",
    description: "A savings goal reaches its target",
    Icon: Home,
    unlocked: ({ goalOptions, earnedKeys }) =>
      earnedKeys.has("down_payment_funded") ||
      goalOptions.some(g => g.target_amount > 0 && g.current_balance >= g.target_amount),
  },
  {
    key: "saver",
    label: "Saver",
    description: "Savings rate ≥ 20% this month",
    Icon: Wallet,
    unlocked: ({ monthTotalIncome, monthTotalSpent, earnedKeys }) =>
      earnedKeys.has("saver") ||
      (monthTotalIncome > 0 && (monthTotalIncome - monthTotalSpent) / monthTotalIncome >= 0.20),
  },
  {
    key: "cash_flow_positive",
    label: "Cash Flow+",
    description: "Income exceeds spending this month",
    Icon: TrendingUp,
    unlocked: ({ monthTotalIncome, monthTotalSpent, earnedKeys }) =>
      earnedKeys.has("cash_flow_positive") ||
      monthTotalIncome > monthTotalSpent,
  },
  {
    key: "stable",
    label: "Stable",
    description: "Financial health score ≥ 70",
    Icon: ShieldCheck,
    unlocked: ({ healthScore, earnedKeys }) =>
      earnedKeys.has("stable") ||
      healthScore >= 70,
  },
  {
    key: "net_worth_25k",
    label: "$25K",
    description: "Net worth crosses $25,000",
    Icon: Trophy,
    unlocked: ({ netWorth, earnedKeys }) =>
      earnedKeys.has("net_worth_25k") ||
      (netWorth?.net_worth ?? 0) >= 25_000,
  },
  {
    key: "net_worth_100k",
    label: "$100K",
    description: "Net worth crosses $100,000",
    Icon: Trophy,
    unlocked: ({ netWorth, earnedKeys }) =>
      earnedKeys.has("net_worth_100k") ||
      (netWorth?.net_worth ?? 0) >= 100_000,
  },
  {
    key: "net_worth_250k",
    label: "$250K",
    description: "Net worth crosses $250,000",
    Icon: Sparkles,
    unlocked: ({ netWorth, earnedKeys }) =>
      earnedKeys.has("net_worth_250k") ||
      (netWorth?.net_worth ?? 0) >= 250_000,
  },
];

// ─── Component ────────────────────────────────────────────────────────────────

interface MilestoneLadderProps {
  milestones: { milestone_key: string; earned_at: string }[];
  netWorth: { net_worth: number } | null;
  monthTotalIncome: number;
  monthTotalSpent: number;
  goalOptions: GoalOption[];
  healthScore: number;
  dataReady: boolean;
}

export default function MilestoneLadder({
  milestones,
  netWorth,
  monthTotalIncome,
  monthTotalSpent,
  goalOptions,
  healthScore,
  dataReady,
}: MilestoneLadderProps) {
  const earnedKeys = new Set(milestones.map(m => m.milestone_key));
  const hasPersistedRef = useRef<Set<string>>(new Set());

  // Persist newly unlocked milestones — gated on data readiness so we don't
  // fire before fetchAll resolves and block subsequent checks with the ref.
  useEffect(() => {
    if (!dataReady) return;
    const earnedSet = new Set(milestones.map(m => m.milestone_key));
    const defProps: BadgeDefProps = {
      earnedKeys: earnedSet,
      netWorth,
      monthTotalIncome,
      monthTotalSpent,
      goalOptions,
      healthScore,
    };
    const toPost = LADDER_DEFS.filter(def => {
      if (earnedSet.has(def.key)) return false;
      if (hasPersistedRef.current.has(def.key)) return false;
      return def.unlocked(defProps);
    });
    if (toPost.length === 0) return;
    toPost.forEach(def => {
      hasPersistedRef.current.add(def.key);
      fetch("/api/milestones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ milestone_key: def.key }),
      }).catch(() => {
        hasPersistedRef.current.delete(def.key);
      });
    });
  }, [dataReady, netWorth, monthTotalIncome, monthTotalSpent, goalOptions, healthScore, milestones]);

  const defProps: BadgeDefProps = {
    earnedKeys,
    netWorth,
    monthTotalIncome,
    monthTotalSpent,
    goalOptions,
    healthScore,
  };

  return (
    <div className="flex gap-4 overflow-x-auto pb-2" style={{ scrollbarWidth: "none" }}>
      {LADDER_DEFS.map(def => {
        const isUnlocked = def.unlocked(defProps);
        const { Icon } = def;
        return (
          <div
            key={def.key}
            title={def.description}
            className="flex flex-col items-center gap-1.5 shrink-0 w-16"
          >
            <div
              className={`w-11 h-11 rounded-full flex items-center justify-center ${isUnlocked ? "" : "bg-[var(--color-elevated)] grayscale"}`}
              style={isUnlocked ? { background: "rgba(245,158,11,0.15)", boxShadow: "var(--shadow-glow)" } : undefined}
            >
              <Icon
                size={18}
                style={isUnlocked ? { color: "var(--color-warning)" } : undefined}
                className={isUnlocked ? "" : "text-[var(--color-text-disabled)]"}
              />
            </div>
            <p className={`text-[9px] text-center leading-tight ${isUnlocked ? "text-[var(--color-text-secondary)]" : "text-[var(--color-text-disabled)] opacity-40"}`}>
              {def.label}
            </p>
          </div>
        );
      })}
    </div>
  );
}
