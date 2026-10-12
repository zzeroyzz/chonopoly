import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveContext } from "@/lib/context";
import { changeStage } from "@/lib/crm/pipelineService";
import { STAGES } from "@/lib/crm/stages";
import { type Stage } from "@/lib/crm/types";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { entry_id?: string; to_stage?: string; note?: string; context_type?: string; context_id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const ctx = await resolveContext(body.context_type, body.context_id, user.id);
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (!body.entry_id) return NextResponse.json({ error: "entry_id required" }, { status: 400 });

  // Validated here as well as by the CHECK constraint, so a bad value comes
  // back as a 400 naming the field rather than a 500 carrying Postgres text.
  if (!body.to_stage || !STAGES.includes(body.to_stage as Stage)) {
    return NextResponse.json({ error: "to_stage is not a valid stage" }, { status: 400 });
  }

  try {
    const entry = await changeStage(body.entry_id, body.to_stage as Stage, ctx, user.id, body.note);
    return NextResponse.json({ entry });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to change stage";
    const status = message.includes("not found") ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
