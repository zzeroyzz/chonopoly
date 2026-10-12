import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveContext } from "@/lib/context";
import { logActivity } from "@/lib/crm/detailService";
import { type ActivityType } from "@/lib/crm/types";

const TYPES: ActivityType[] = ["call", "text", "email", "note", "door_knock", "mail", "web_form"];

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: {
    pipeline_entry_id?: string;
    contact_id?: string | null;
    type?: string;
    direction?: "inbound" | "outbound" | "na";
    outcome?: string | null;
    body?: string | null;
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

  if (!body.pipeline_entry_id) {
    return NextResponse.json({ error: "pipeline_entry_id required" }, { status: 400 });
  }
  if (!body.type || !TYPES.includes(body.type as ActivityType)) {
    return NextResponse.json({ error: "type is not a valid activity type" }, { status: 400 });
  }

  try {
    const activity = await logActivity(
      {
        pipeline_entry_id: body.pipeline_entry_id,
        contact_id: body.contact_id ?? null,
        type: body.type as ActivityType,
        direction: body.direction,
        outcome: body.outcome ?? null,
        body: body.body ?? null,
      },
      ctx,
      user.id
    );
    return NextResponse.json({ activity });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to log the activity";
    const status = message.includes("not found") ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
