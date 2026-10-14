import { Resend } from "resend";

const FROM = process.env.RESEND_FROM_EMAIL ?? "noreply@parkhawkinsproperties.com";
function resend() { return new Resend(process.env.RESEND_API_KEY); }

function fmt(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export async function sendBillDueSoonEmail(
  user: { email: string; name: string },
  bill: { name: string; amount: number; next_due_date: string },
  daysUntilDue: number
): Promise<void> {
  await resend().emails.send({
    from: FROM,
    to: user.email,
    subject: `Your ${bill.name} is due in ${daysUntilDue} days — ${fmt(bill.amount)}`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;color:#111;">
        <h2 style="margin-bottom:4px;">Upcoming bill</h2>
        <p>Hey ${user.name},</p>
        <p>Your <strong>${bill.name}</strong> payment of <strong>${fmt(bill.amount)}</strong>
           is due in <strong>${daysUntilDue} day${daysUntilDue === 1 ? "" : "s"}</strong>
           on ${new Date(bill.next_due_date + "T00:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}.</p>
        <p style="color:#9ca3af;font-size:12px;margin-top:24px;">Park Hawkins Properties · Finance Tracker</p>
      </div>
    `,
  });
}

export async function sendBillDueTodayEmail(
  user: { email: string; name: string },
  bill: { name: string; amount: number }
): Promise<void> {
  await resend().emails.send({
    from: FROM,
    to: user.email,
    subject: `${bill.name} is due today — ${fmt(bill.amount)}`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;color:#111;">
        <h2 style="margin-bottom:4px;">Bill due today</h2>
        <p>Hey ${user.name},</p>
        <p>Your <strong>${bill.name}</strong> payment of <strong>${fmt(bill.amount)}</strong>
           is due today.</p>
        <p style="color:#9ca3af;font-size:12px;margin-top:24px;">Park Hawkins Properties · Finance Tracker</p>
      </div>
    `,
  });
}
