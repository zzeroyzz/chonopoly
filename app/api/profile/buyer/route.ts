import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveContext } from "@/lib/context";
import {
  getProfile,
  createProfile,
  updateProfile,
} from "@/lib/profile/buyerProfileService";
import { type ProfileDebt, type ProfileIncome, type ProfileDefaults } from "@/lib/profile/types";

/**
 * The buyer profile.
 *
 * Personal context only — the service rejects a team context, because a team
 * here can include an agent or an assistant and a salary is not theirs to read.
 *
 * Error messages name the field, never the value. Income and debt figures must
 * not reach a log or an error payload.
 */

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Always the signed-in user's own profile, never the active context's. A
  // team context has no profile, and resolving one here would hand back null
  // for a user whose income is on file.
  const ctx = await resolveContext("personal", null, user.id);
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    // null is a real answer: it puts the calculator into its "set your income"
    // state rather than screening against a number nobody entered.
    return NextResponse.json({ profile: await getProfile(ctx) });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load the profile";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

interface Row {
  label?: unknown;
  grossMonthly?: unknown;
  monthlyPayment?: unknown;
}

/** Validated at the boundary so a bad figure is a 400 naming the field. */
function readAmountRows(
  rows: unknown,
  field: "grossMonthly" | "monthlyPayment",
  /**
   * Income only. A zero income is not a saved profile, it is the "set your
   * income" state wearing a saved profile's clothes.
   *
   * This is the bug that reached production: an amount typed into the name
   * box left `gross_monthly` at 0, the row passed every check here, the server
   * returned 200, Settings said "Saved." — and every house went on reading
   * "Set your income" with a DTI of 0%, because the total income really was
   * zero. Nothing in that chain was wrong except that zero was allowed through.
   */
  requirePositive = false
): { label: string; amount: number }[] | { error: string } {
  if (!Array.isArray(rows)) return { error: `${field} rows must be an array` };

  const noun = field === "grossMonthly" ? "income" : "debt";

  const out: { label: string; amount: number }[] = [];
  for (const raw of rows) {
    const r = raw as Row;
    const label = typeof r.label === "string" ? r.label.trim() : "";
    if (!label) return { error: `Every ${noun} needs a name` };

    const amount = Number(r[field]);
    // The label is the user's own text and safe to echo. The amount never is.
    if (!Number.isFinite(amount)) return { error: `"${label}" needs a monthly amount` };
    if (amount < 0) return { error: `"${label}" cannot be negative` };
    if (requirePositive && amount === 0) {
      return {
        error: `"${label}" has no monthly amount. Put the name in the first box and the amount in the second.`,
      };
    }

    out.push({ label, amount });
  }
  return out;
}

/** First run: create the profile from the calculator's modal. */
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { incomes?: unknown; debts?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const ctx = await resolveContext("personal", null, user.id);
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const incomes = readAmountRows(body.incomes ?? [], "grossMonthly", true);
  if ("error" in incomes) return NextResponse.json({ error: incomes.error }, { status: 400 });

  const debts = readAmountRows(body.debts ?? [], "monthlyPayment");
  if ("error" in debts) return NextResponse.json({ error: debts.error }, { status: 400 });

  if (incomes.length === 0) {
    return NextResponse.json({ error: "at least one income is required" }, { status: 400 });
  }

  try {
    const profile = await createProfile(
      {
        incomes: incomes.map((i) => ({ label: i.label, grossMonthly: i.amount })),
        debts: debts.map((d) => ({ label: d.label, monthlyPayment: d.amount })),
      },
      ctx,
      user.id
    );
    return NextResponse.json({ profile });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to create the profile";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** Settings writes. Everything after creation comes through here. */
export async function PUT(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: {
    cashAvailable?: number;
    cashReserves?: number;
    defaults?: Partial<ProfileDefaults>;
    incomes?: ProfileIncome[];
    debts?: ProfileDebt[];
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const ctx = await resolveContext("personal", null, user.id);
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (body.incomes) {
    const check = readAmountRows(body.incomes, "grossMonthly", true);
    if ("error" in check) return NextResponse.json({ error: check.error }, { status: 400 });
  }
  if (body.debts) {
    const check = readAmountRows(body.debts, "monthlyPayment");
    if ("error" in check) return NextResponse.json({ error: check.error }, { status: 400 });
  }

  try {
    return NextResponse.json({ profile: await updateProfile(body, ctx) });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to save the profile";
    const status = message.includes("not found") ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
