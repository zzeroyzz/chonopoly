export interface Category {
  id: string;
  user_id: string | null;
  name: string;
  color: string;
  icon: string;
  is_custom: boolean;
  created_at: string;
}

export interface Budget {
  id: string;
  goal_id: string;
  owner_type: string;
  owner_id: string;
  category_id: string;
  period_type: string;
  period_start: string;
  period_end: string;
  total_limit: number;
  recurring: boolean;
  rollover_enabled: boolean;
  status: string;
  created_at: string;
}

export interface Transaction {
  id: string;
  user_id: string;
  plaid_transaction_id: string | null;
  merchant_name: string;
  amount: number;
  date: string;
  category_id: string | null;
  note: string | null;
  is_manual: boolean;
  created_at: string;
}

export interface BudgetSummary {
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

export interface UserProfile {
  id: string;
  email: string;
  username: string | null;
  pay_cycle_start_day: number;
}
