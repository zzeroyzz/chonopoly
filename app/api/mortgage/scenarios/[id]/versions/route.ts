import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveContext } from "@/lib/context";
import { listVersions, restoreVersion } from "@/lib/mortgage/scenarioService";

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
    return NextResponse.json({ versions: await listVersions(id, ctx) });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to list versions";
    return NextResponse.json({ error: message }, { status: notFound(message) });
  }
}

/** Restore a past version. Writes it forward as a new save, never a rewind. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { version?: number; context_type?: string; context_id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const ctx = await resolveContext(body.context_type, body.context_id, user.id);
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (typeof body.version !== "number" || !Number.isInteger(body.version)) {
    return NextResponse.json({ error: "version must be an integer" }, { status: 400 });
  }

  const { id } = await params;
  try {
    const scenario = await restoreVersion(id, body.version, ctx, user.id);
    return NextResponse.json({ scenario });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to restore version";
    return NextResponse.json({ error: message }, { status: notFound(message) });
  }
}
