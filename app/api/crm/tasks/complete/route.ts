import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveContext } from "@/lib/context";
import { completeTask } from "@/lib/crm/pipelineService";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { task_id?: string; context_type?: string; context_id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const ctx = await resolveContext(body.context_type, body.context_id, user.id);
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (!body.task_id) return NextResponse.json({ error: "task_id required" }, { status: 400 });

  try {
    const task = await completeTask(body.task_id, ctx, user.id);
    return NextResponse.json({ task });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to complete task";
    const status = message.includes("not found") ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
