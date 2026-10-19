import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveContext } from "@/lib/context";
import { getRehabEstimate, saveRehabEstimate } from "@/lib/rehab/rehabService";
import { REHAB_SYSTEMS, type RehabEstimate, type RehabLine } from "@/lib/rehab/types";

/**
 * One house's rehab estimate.
 *
 * Validated at the boundary: a bad condition or a negative cost comes back as
 * a 400 naming the system, rather than a 500 carrying Postgres text.
 */

async function context(request: Request, body?: { context_type?: string; context_id?: string }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };

  const params = new URL(request.url).searchParams;
  const ctx = await resolveContext(
    body?.context_type ?? params.get("context_type") ?? undefined,
    body?.context_id ?? params.get("context_id") ?? undefined,
    user.id
  );
  if (!ctx) return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  return { ctx, userId: user.id };
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const resolved = await context(request);
  if ("error" in resolved) return resolved.error;

  const { id } = await params;
  try {
    // null is a real answer: it means "no estimate yet", which is what puts
    // the rehab number back on the budget and labels it Budget only.
    return NextResponse.json({ rehab: await getRehabEstimate(id, resolved.ctx) });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load the estimate";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

const CONDITIONS = new Set(["good", "repair", "replace"]);

function readEstimate(raw: unknown): RehabEstimate | { error: string } {
  if (!raw || typeof raw !== "object") return { error: "estimate is required" };
  const body = raw as Partial<RehabEstimate>;

  if (!Array.isArray(body.lines)) return { error: "estimate.lines must be an array" };

  const known = new Set<string>(REHAB_SYSTEMS);
  const lines: RehabLine[] = [];

  for (const entry of body.lines) {
    const line = entry as Partial<RehabLine>;
    const system = String(line.system ?? "");
    if (!known.has(system)) return { error: `"${system}" is not a system on the checklist` };

    const condition = String(line.condition ?? "good");
    if (!CONDITIONS.has(condition)) {
      return { error: `${system} needs a condition of good, repair or replace` };
    }

    const cost = Number(line.cost ?? 0);
    if (!Number.isFinite(cost) || cost < 0) {
      return { error: `${system} needs a cost of zero or more` };
    }

    lines.push({
      system: system as RehabLine["system"],
      condition: condition as RehabLine["condition"],
      // Good costs nothing, enforced here as well as in the UI so a hand-made
      // request cannot store a priced "good".
      cost: condition === "good" ? 0 : cost,
      note: typeof line.note === "string" ? line.note.slice(0, 500) : "",
    });
  }

  return {
    lines,
    source: body.source === "visit" ? "visit" : "photos",
    visitNotes: typeof body.visitNotes === "string" ? body.visitNotes.slice(0, 4_000) : "",
  };
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  let body: { estimate?: unknown; context_type?: string; context_id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const resolved = await context(request, body);
  if ("error" in resolved) return resolved.error;

  const estimate = readEstimate(body.estimate);
  if ("error" in estimate) {
    return NextResponse.json({ error: estimate.error }, { status: 400 });
  }

  const { id } = await params;
  try {
    const rehab = await saveRehabEstimate(id, estimate, resolved.ctx, resolved.userId);
    return NextResponse.json({ rehab });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to save the estimate";
    const status = message.includes("not found") ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
