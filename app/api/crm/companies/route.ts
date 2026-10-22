import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveContext } from "@/lib/context";
import { listCompanies, createCompany, type CompanyInput } from "@/lib/crm/companyService";

/** Every company you've recorded, with how many houses each holds. */
export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const ctx = await resolveContext(
    searchParams.get("context_type") ?? undefined,
    searchParams.get("context_id") ?? undefined,
    user.id
  );
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const companies = await listCompanies(ctx);
    return NextResponse.json({ companies });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load companies";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * Record a company.
 *
 * The name is the only thing required, because it is the only thing you always
 * have when you find one. Everything else can be filled in later.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const ctx = await resolveContext(
    searchParams.get("context_type") ?? undefined,
    searchParams.get("context_id") ?? undefined,
    user.id
  );
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "That request wasn't readable." }, { status: 400 });
  }

  const input = body as Partial<CompanyInput>;
  if (typeof input?.name !== "string" || input.name.trim().length === 0) {
    return NextResponse.json({ error: "A company needs a name." }, { status: 400 });
  }

  try {
    const company = await createCompany(ctx, user.id, input as CompanyInput);
    return NextResponse.json({ company }, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to save the company";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
