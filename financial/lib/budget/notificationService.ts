import { Resend } from "resend";
import { UserProfile } from "./types";

const FROM = process.env.RESEND_FROM_EMAIL ?? "noreply@parkhawkinsproperties.com";
function resend() { return new Resend(process.env.RESEND_API_KEY); }

function fmt(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

// ─── 80% warning ─────────────────────────────────────────────────────────────

export async function sendBudgetWarningEmail(
  user: UserProfile,
  budget: { category?: { name: string }; total_limit: number; period?: { amount_spent: number; effective_limit: number } },
  percentUsed: number
): Promise<void> {
  const categoryName = budget.category?.name ?? "this category";
  const limit = budget.period?.effective_limit ?? budget.total_limit;
  const spent = budget.period?.amount_spent ?? 0;
  const remaining = Math.max(0, limit - spent);
  const name = user.username ?? "there";

  await resend().emails.send({
    from: FROM,
    to: user.email,
    subject: `Heads up — you've used ${Math.round(percentUsed)}% of your ${categoryName} budget`,
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; color: #111;">
        <h2 style="margin-bottom: 4px;">Spending alert 👀</h2>
        <p>Hey ${name},</p>
        <p>
          You've used <strong>${Math.round(percentUsed)}%</strong> of your
          <strong>${categoryName}</strong> budget this month. Here's where you stand:
        </p>
        <table style="width:100%; border-collapse:collapse; margin: 16px 0;">
          <tr><td style="padding:6px 0; color:#555;">Monthly limit</td><td style="text-align:right; font-weight:600;">${fmt(limit)}</td></tr>
          <tr><td style="padding:6px 0; color:#555;">Spent so far</td><td style="text-align:right; font-weight:600; color:#dc2626;">${fmt(spent)}</td></tr>
          <tr style="border-top:1px solid #e5e7eb;">
            <td style="padding:8px 0; font-weight:600;">Remaining</td>
            <td style="text-align:right; font-weight:700; color:#16a34a;">${fmt(remaining)}</td>
          </tr>
        </table>
        <p style="color:#555; font-size:14px;">
          You have <strong>${fmt(remaining)}</strong> left. Keep an eye on your
          ${categoryName} spending for the rest of the month to stay on track.
        </p>
        <p style="color:#9ca3af; font-size:12px; margin-top:24px;">
          Park Hawkins Properties · Budget Tracker
        </p>
      </div>
    `,
  });
}

// ─── Over-budget alert ────────────────────────────────────────────────────────

export async function sendBudgetOverEmail(
  user: UserProfile,
  budget: { category?: { name: string }; total_limit: number; period?: { amount_spent: number; effective_limit: number } },
  amountOver: number
): Promise<void> {
  const categoryName = budget.category?.name ?? "this category";
  const limit = budget.period?.effective_limit ?? budget.total_limit;
  const spent = budget.period?.amount_spent ?? 0;
  const name = user.username ?? "there";

  await resend().emails.send({
    from: FROM,
    to: user.email,
    subject: `You're over your ${categoryName} budget this month`,
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; color: #111;">
        <h2 style="margin-bottom: 4px; color:#dc2626;">Over budget 🚨</h2>
        <p>Hey ${name},</p>
        <p>
          You've exceeded your <strong>${categoryName}</strong> budget by
          <strong style="color:#dc2626;">${fmt(amountOver)}</strong> this month.
        </p>
        <table style="width:100%; border-collapse:collapse; margin: 16px 0;">
          <tr><td style="padding:6px 0; color:#555;">Monthly limit</td><td style="text-align:right; font-weight:600;">${fmt(limit)}</td></tr>
          <tr><td style="padding:6px 0; color:#555;">Total spent</td><td style="text-align:right; font-weight:600; color:#dc2626;">${fmt(spent)}</td></tr>
          <tr style="border-top:1px solid #e5e7eb;">
            <td style="padding:8px 0; font-weight:600; color:#dc2626;">Over by</td>
            <td style="text-align:right; font-weight:700; color:#dc2626;">${fmt(amountOver)}</td>
          </tr>
        </table>
        <p style="color:#555; font-size:14px;">A couple of options:</p>
        <ul style="color:#555; font-size:14px; line-height:1.7;">
          <li>Review your recent ${categoryName} transactions to spot anything unexpected.</li>
          <li>Adjust your monthly limit if your spending habits have changed.</li>
        </ul>
        <p style="color:#9ca3af; font-size:12px; margin-top:24px;">
          Park Hawkins Properties · Budget Tracker
        </p>
      </div>
    `,
  });
}

// ─── Month-end savings nudge ──────────────────────────────────────────────────

export async function sendSavingsNudgeEmail(
  user: UserProfile,
  budgetName: string,
  unspentAmount: number
): Promise<void> {
  const name = user.username ?? "there";

  await resend().emails.send({
    from: FROM,
    to: user.email,
    subject: `Your ${budgetName} budget has ${fmt(unspentAmount)} unspent — consider saving it`,
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; color: #111;">
        <h2 style="margin-bottom: 4px;">Your budget period ends soon 💰</h2>
        <p>Hey ${name},</p>
        <p>
          Your <strong>${budgetName}</strong> budget period is wrapping up and you have
          <strong>${fmt(unspentAmount)}</strong> left unspent.
        </p>
        <p>
          Consider transferring <strong>${fmt(unspentAmount)}</strong> to your savings account
          before the period resets — small transfers add up over time.
        </p>
        <p style="color:#555; font-size:14px;">
          This is a reminder only. No money has been moved automatically.
        </p>
        <p style="color:#9ca3af; font-size:12px; margin-top:24px;">
          Park Hawkins Properties · Budget Tracker
        </p>
      </div>
    `,
  });
}
