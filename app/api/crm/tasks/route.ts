import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveContext } from "@/lib/context";
import { createTask } from "@/lib/crm/detailService";
import { listMyTasks } from "@/lib/crm/pipelineService";

/** Open tasks for the signed-in user. Backs the My tasks screen. */
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
    const tasks = await listMyTasks(ctx, user.id);
    return NextResponse.json({ tasks });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load tasks";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: {
    pipeline_entry_id?: string;
    title?: string;
    due_date?: string;
    assigned_to?: string | null;
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

  if (!body.pipeline_entry_id || !body.title?.trim() || !body.due_date) {
    return NextResponse.json(
      { error: "pipeline_entry_id, title and due_date are required" },
      { status: 400 }
    );
  }

  try {
    const task = await createTask(
      {
        pipeline_entry_id: body.pipeline_entry_id,
        title: body.title.trim(),
        due_date: body.due_date,
        assigned_to: body.assigned_to ?? null,
      },
      ctx,
      user.id
    );
    return NextResponse.json({ task });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to create the task";
    const status = message.includes("not found") ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
