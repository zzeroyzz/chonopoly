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
  field: "grossMonthly" | "monthlyPayment"
): { label: string; amount: number }[] | { error: string } {
  if (!Array.isArray(rows)) return { error: `${field} rows must be an array` };

  const out: { label: string; amount: number }[] = [];
  for (const raw of rows) {
    const r = raw as Row;
    const label = typeof r.label === "string" ? r.label.trim() : "";
    if (!label) return { error: "each row needs a name" };

    const amount = Number(r[field]);
    if (!Number.isFinite(amount)) return { error: `${field} must be a number` };
    if (amount < 0) return { error: `${field} cannot be negative` };

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

  const incomes = readAmountRows(body.incomes ?? [], "grossMonthly");
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
    const check = readAmountRows(body.incomes, "grossMonthly");
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
