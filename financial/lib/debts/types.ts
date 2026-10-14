export type DebtType = "credit_card" | "personal_loan" | "student_loan" | "auto" | "mortgage" | "other";

export const DEBT_TYPE_META: Record<DebtType, { label: string; icon: string }> = {
  credit_card:    { label: "Credit Card",    icon: "💳" },
  personal_loan:  { label: "Personal Loan",  icon: "🏦" },
  student_loan:   { label: "Student Loan",   icon: "🎓" },
  auto:           { label: "Auto Loan",      icon: "🚗" },
  mortgage:       { label: "Mortgage",       icon: "🏠" },
  other:          { label: "Other",          icon: "📋" },
};

export interface DebtSummary {
  id: string;
  name: string;
  icon: string;
  debt_type: DebtType;
  original_balance: number;
  current_balance: number;
  interest_rate: number;
  minimum_payment: number;
  priority_order: number;
  target_date: string | null;
  status: "active" | "paid_off" | "paused";
  created_at: string;
  // Computed
  amount_paid: number;
  percent_paid: number;
  monthly_interest: number;
  months_to_payoff: number | null;
  projected_payoff_date: string | null;
  total_interest_remaining: number | null;
}
