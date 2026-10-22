import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { RequestContext } from "../context";
import { type Company, type PortfolioHouse } from "./types";

/**
 * Companies: who has the houses.
 *
 * A company is a `contacts` row with `kind = 'company'`. It is not a table of
 * its own because everything a company needs — a name, a phone, an address,
 * and a many-to-many link to houses — already hangs off a contact, and a
 * second table would mean four parallel structures that can drift apart.
 *
 * The portfolio link is `property_contacts` with `relationship = 'owner'`,
 * which is already what the enum means: a lender selling REO owns the house
 * until somebody buys it.
 *
 * Every read and write is scoped by `owner_type` / `owner_id`, the same as
 * every other service here. A row created outside that scope is invisible to
 * the person who made it, which is the failure this guards against.
 */

function db(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/** The link that means "this company has this house". */
const PORTFOLIO_RELATIONSHIP = "owner";

export interface CompanyInput {
  name: string;
  phone?: string | null;
  website?: string | null;
  addressLine1?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  notes?: string | null;
}

interface ContactRow {
  id: string;
  company: string | null;
  website: string | null;
  mailing_address_line1: string | null;
  mailing_city: string | null;
  mailing_state: string | null;
  mailing_zip: string | null;
  notes: string | null;
}

function toCompany(row: ContactRow, phone: string | null, propertyCount: number): Company {
  return {
    id: row.id,
    // A company with no name recorded is still a row you have to be able to
    // open and fix, so it says so rather than rendering as a blank line.
    name: row.company ?? "Unnamed company",
    phone,
    website: row.website,
    addressLine1: row.mailing_address_line1,
    city: row.mailing_city,
    state: row.mailing_state,
    zip: row.mailing_zip,
    notes: row.notes,
    propertyCount,
  };
}

const CONTACT_COLUMNS =
  "id, company, website, mailing_address_line1, mailing_city, mailing_state, mailing_zip, notes";

/**
 * Every company, with how many houses each holds.
 *
 * Three queries rather than one join: Supabase cannot count a join's children
 * per parent without a view, and counting in SQL beats pulling every link row
 * and counting them here.
 */
export async function listCompanies(ctx: RequestContext): Promise<Company[]> {
  const client = db();

  const { data: rows, error } = await client
    .from("contacts")
    .select(CONTACT_COLUMNS)
    .eq("owner_type", ctx.type)
    .eq("owner_id", ctx.id)
    .eq("kind", "company")
    .order("company", { ascending: true });

  if (error) throw new Error(error.message);
  const contacts = (rows ?? []) as ContactRow[];
  if (contacts.length === 0) return [];

  const ids = contacts.map((c) => c.id);

  const [{ data: links }, { data: phones }] = await Promise.all([
    client
      .from("property_contacts")
      .select("contact_id")
      .in("contact_id", ids)
      .eq("relationship", PORTFOLIO_RELATIONSHIP),
    client
      .from("contact_phones")
      .select("contact_id, number, is_primary")
      .in("contact_id", ids),
  ]);

  const counts = new Map<string, number>();
  for (const link of links ?? []) {
    counts.set(link.contact_id, (counts.get(link.contact_id) ?? 0) + 1);
  }

  const phoneFor = new Map<string, string>();
  for (const phone of phones ?? []) {
    if (phone.is_primary || !phoneFor.has(phone.contact_id)) {
      phoneFor.set(phone.contact_id, phone.number);
    }
  }

  return contacts.map((row) =>
    toCompany(row, phoneFor.get(row.id) ?? null, counts.get(row.id) ?? 0)
  );
}

export interface CompanyDetail {
  company: Company;
  portfolio: PortfolioHouse[];
}

/** One company and the houses it holds. Null when it is not yours or not there. */
export async function getCompany(
  ctx: RequestContext,
  companyId: string
): Promise<CompanyDetail | null> {
  const client = db();

  const { data: row } = await client
    .from("contacts")
    .select(CONTACT_COLUMNS)
    .eq("id", companyId)
    .eq("owner_type", ctx.type)
    .eq("owner_id", ctx.id)
    .eq("kind", "company")
    .maybeSingle();

  if (!row) return null;

  const [{ data: links }, { data: phones }] = await Promise.all([
    client
      .from("property_contacts")
      .select("property_id")
      .eq("contact_id", companyId)
      .eq("relationship", PORTFOLIO_RELATIONSHIP),
    client.from("contact_phones").select("number, is_primary").eq("contact_id", companyId),
  ]);

  const propertyIds = (links ?? []).map((l) => l.property_id);
  let portfolio: PortfolioHouse[] = [];

  if (propertyIds.length > 0) {
    const { data: properties } = await client
      .from("properties")
      .select("id, address_line1, city, state, zip, list_price, photo_url, beds, baths, sqft")
      .in("id", propertyIds)
      // Scoped again: a link could name a house that is not yours.
      .eq("owner_type", ctx.type)
      .eq("owner_id", ctx.id)
      .order("address_line1", { ascending: true });

    portfolio = (properties ?? []).map((p) => ({
      propertyId: p.id,
      address: p.address_line1,
      cityStateZip: [p.city, p.state, p.zip].filter(Boolean).join(", "),
      listPrice: p.list_price,
      photoUrl: p.photo_url,
      beds: p.beds,
      baths: p.baths,
      sqft: p.sqft,
    }));
  }

  const primary = (phones ?? []).find((p) => p.is_primary) ?? (phones ?? [])[0];

  return {
    company: toCompany(row as ContactRow, primary?.number ?? null, portfolio.length),
    portfolio,
  };
}

function trimmed(value: string | null | undefined): string | null {
  const v = (value ?? "").trim();
  return v.length > 0 ? v : null;
}

/** Add a company. The phone goes in its own table, where contacts keep phones. */
export async function createCompany(
  ctx: RequestContext,
  userId: string,
  input: CompanyInput
): Promise<Company> {
  const name = trimmed(input.name);
  if (!name) throw new Error("A company needs a name.");

  const client = db();

  const { data, error } = await client
    .from("contacts")
    .insert({
      owner_type: ctx.type,
      owner_id: ctx.id,
      kind: "company",
      company: name,
      website: trimmed(input.website),
      mailing_address_line1: trimmed(input.addressLine1),
      mailing_city: trimmed(input.city),
      mailing_state: trimmed(input.state),
      mailing_zip: trimmed(input.zip),
      notes: trimmed(input.notes),
      created_by: userId,
    })
    .select(CONTACT_COLUMNS)
    .single();

  if (error) throw new Error(error.message);

  const phone = trimmed(input.phone);
  if (phone) {
    const { error: phoneError } = await client.from("contact_phones").insert({
      contact_id: data.id,
      number: phone,
      is_primary: true,
      source: "manual",
    });
    // The company exists either way. Losing the number silently would be
    // worse than saying the number did not save.
    if (phoneError) throw new Error(`Saved the company, but not the phone: ${phoneError.message}`);
  }

  return toCompany(data as ContactRow, phone, 0);
}

/** Put a house in a company's portfolio. Both must already be yours. */
export async function addHouseToPortfolio(
  ctx: RequestContext,
  companyId: string,
  propertyId: string
): Promise<void> {
  const client = db();

  const [{ data: company }, { data: property }] = await Promise.all([
    client
      .from("contacts")
      .select("id")
      .eq("id", companyId)
      .eq("owner_type", ctx.type)
      .eq("owner_id", ctx.id)
      .eq("kind", "company")
      .maybeSingle(),
    client
      .from("properties")
      .select("id")
      .eq("id", propertyId)
      .eq("owner_type", ctx.type)
      .eq("owner_id", ctx.id)
      .maybeSingle(),
  ]);

  if (!company) throw new Error("Company not found");
  if (!property) throw new Error("House not found");

  // The table's UNIQUE (property_id, contact_id, relationship) makes adding
  // the same house twice a no-op rather than a duplicate row.
  const { error } = await client
    .from("property_contacts")
    .upsert(
      {
        property_id: propertyId,
        contact_id: companyId,
        relationship: PORTFOLIO_RELATIONSHIP,
        is_primary: false,
      },
      { onConflict: "property_id,contact_id,relationship" }
    );

  if (error) throw new Error(error.message);
}
