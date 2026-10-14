import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { DebtSummary } from "./types";
import { RequestContext } from "../context";

function db(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// Standard amortization: months until balance reaches zero at a fixed payment.
// Returns null if payment doesn't cover monthly interest (debt never pays off).
export function monthsToPayoff(balance: number, apr: number, payment: number): number | null {
  if (balance <= 0) return 0;
  const r = apr / 100 / 12;
  if (r === 0) return payment > 0 ? balance / payment : null;
  if (payment <= balance * r) return null;
  return -Math.log(1 - (r * balance) / payment) / Math.log(1 + r);
}

export async function getDebtSummary(userId: string, ctx: RequestContext): Promise<DebtSummary[]> {
  void userId;
  const { data: debts } = await db()
    .from("debts")
    .select("id, name, icon, debt_type, original_balance, current_balance, interest_rate, minimum_payment, priority_order, target_date, status, created_at")
    .eq("owner_type", ctx.type)
    .eq("owner_id", ctx.id)
    .order("priority_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (!debts?.length) return [];

  return debts.map(debt => {
    const original   = Number(debt.original_balance);
    const current    = Number(debt.current_balance);
    const rate       = Number(debt.interest_rate);
    const minPayment = Number(debt.minimum_payment);

    const amountPaid   = Math.max(0, original - current);
    const percentPaid  = original > 0 ? Math.min(100, (amountPaid / original) * 100) : 0;
    const monthlyInterest = current * (rate / 100 / 12);
    const n = monthsToPayoff(current, rate, minPayment);
    const totalInterestRemaining = n !== null ? Math.max(0, n * minPayment - current) : null;

    let projectedPayoffDate: string | null = null;
    if (n !== null && n > 0) {
      const d = new Date();
      d.setMonth(d.getMonth() + Math.ceil(n));
      projectedPayoffDate = d.toISOString().split("T")[0];
    }

    return {
      id:                     debt.id,
      name:                   debt.name,
      icon:                   debt.icon,
      debt_type:              debt.debt_type,
      original_balance:       original,
      current_balance:        current,
      interest_rate:          rate,
      minimum_payment:        minPayment,
      priority_order:         debt.priority_order,
      target_date:            debt.target_date ?? null,
      status:                 debt.status as DebtSummary["status"],
      created_at:             debt.created_at,
      amount_paid:            amountPaid,
      percent_paid:           percentPaid,
      monthly_interest:       monthlyInterest,
      months_to_payoff:       n,
      projected_payoff_date:  projectedPayoffDate,
      total_interest_remaining: totalInterestRemaining,
    };
  });
}
