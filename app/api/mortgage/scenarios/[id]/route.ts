import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveContext } from "@/lib/context";
import { getScenario, renameScenario, setPrimary, deleteScenario } from "@/lib/mortgage/scenarioService";

const notFound = (message: string) => (message.includes("not found") ? 404 : 500);

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
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

  const { id } = await params;
  try {
    return NextResponse.json({ scenario: await getScenario(id, ctx) });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load scenario";
    return NextResponse.json({ error: message }, { status: notFound(message) });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: {
    label?: string;
    /** Make this the house's primary scenario. */
    is_primary?: boolean;
    context_type?: string;
    context_id?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const ctx = await resolveContext(body.context_type, body.context_id, user.id);
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;

  // Promoting and renaming are both small edits to one scenario, so they share
  // the route rather than growing a /primary endpoint beside it.
  if (body.is_primary === true) {
    try {
      return NextResponse.json({ scenario: await setPrimary(id, ctx) });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to set the primary";
      return NextResponse.json({ error: message }, { status: notFound(message) });
    }
  }

  if (!body.label?.trim()) {
    return NextResponse.json({ error: "label or is_primary is required" }, { status: 400 });
  }

  try {
    return NextResponse.json({ scenario: await renameScenario(id, body.label, ctx) });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to rename scenario";
    return NextResponse.json({ error: message }, { status: notFound(message) });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
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

  const { id } = await params;
  try {
    // Soft delete — the row and its history stay, so this is recoverable.
    await deleteScenario(id, ctx);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to delete scenario";
    return NextResponse.json({ error: message }, { status: notFound(message) });
  }
}
