export interface ConnectedItem {
  itemId: string;
  institutionName: string | null;
}

export interface Account {
  account_id: string;
  item_id: string;
  name: string;
  type: string;
  subtype: string | null;
  balances: { current: number | null; available: number | null };
  institution_name: string | null;
}

export interface Transaction {
  transaction_id: string;
  account_id: string;
  name: string;
  merchant_name: string | null;
  amount: number;
  date: string;
  personal_finance_category: { primary: string; detailed: string } | null;
  logo_url: string | null;
  category_override: string | null;
}

export type ViewState =
  | "overview"
  | "manage"
  | "budgets"
  | "goals"
  | "debts"
  | "bills"
  | "transactions"
  | "analytics"
  | "profile"
  | "team-settings"
  | { type: "account"; accountId: string };

export const CATEGORY_META: Record<string, { label: string; color: string; hex: string; icon: string }> = {
  FOOD_AND_DRINK:       { label: "Food & Drink",    color: "bg-emerald-500/15 text-emerald-400", hex: "#34d399", icon: "UtensilsCrossed" },
  TRANSPORTATION:       { label: "Transportation",  color: "bg-blue-500/15 text-blue-400",      hex: "#60a5fa", icon: "Car" },
  ENTERTAINMENT:        { label: "Entertainment",   color: "bg-purple-500/15 text-purple-400",  hex: "#a78bfa", icon: "Film" },
  GENERAL_MERCHANDISE:  { label: "Shopping",        color: "bg-orange-500/15 text-orange-400",  hex: "#fb923c", icon: "ShoppingBag" },
  HOME_IMPROVEMENT:     { label: "Home",            color: "bg-yellow-500/15 text-yellow-400",  hex: "#facc15", icon: "House" },
  MEDICAL:              { label: "Medical",         color: "bg-red-500/15 text-red-400",        hex: "#f87171", icon: "HeartPulse" },
  PERSONAL_CARE:        { label: "Personal Care",   color: "bg-pink-500/15 text-pink-400",      hex: "#f472b6", icon: "Sparkles" },
  TRAVEL:               { label: "Travel",          color: "bg-cyan-500/15 text-cyan-400",      hex: "#22d3ee", icon: "Plane" },
  RENT_AND_UTILITIES:   { label: "Rent & Utilities", color: "bg-indigo-500/15 text-indigo-400", hex: "#818cf8", icon: "Zap" },
  GENERAL_SERVICES:     { label: "Services",        color: "bg-sky-500/15 text-sky-400",        hex: "#38bdf8", icon: "Wrench" },
  TRANSFER_IN:          { label: "Transfer In",     color: "bg-teal-500/15 text-teal-400",      hex: "#2dd4bf", icon: "ArrowDownLeft" },
  TRANSFER_OUT:         { label: "Transfer Out",    color: "bg-teal-500/15 text-teal-400",      hex: "#5eead4", icon: "ArrowUpRight" },
  INCOME:               { label: "Income",          color: "bg-green-500/15 text-green-400",    hex: "#4ade80", icon: "TrendingUp" },
  LOAN_PAYMENTS:        { label: "Loan",            color: "bg-rose-500/15 text-rose-400",      hex: "#fb7185", icon: "Banknote" },
  BANK_FEES:            { label: "Bank Fees",       color: "bg-zinc-500/15 text-zinc-400",      hex: "#a1a1aa", icon: "Building2" },
  OTHER:                { label: "Other",           color: "bg-zinc-500/15 text-zinc-400",      hex: "#71717a", icon: "CircleDot" },
};

export interface BudgetSummaryRow {
  budget_id: string;
  goal_id: string;
  name: string | null;
  category_name: string;
  category_color: string;
  category_icon: string;
  total_limit: number;
  effective_limit: number;
  amount_spent: number;
  amount_remaining: number;
  percent_used: number;
  over_budget: boolean;
  period_type: string;
  period_start: string;
  period_end: string;
  days_remaining: number;
  daily_rate: number;
  transaction_count: number;
  notified_80: boolean;
  notified_over: boolean;
  nudge_sent: boolean;
  status: "active" | "paused";
}

export function getCategoryMeta(primary: string | undefined) {
  return CATEGORY_META[primary ?? "OTHER"] ?? CATEGORY_META.OTHER;
}

export function formatDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function formatMoney(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
