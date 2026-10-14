import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data } = await supabase
    .from("categories")
    .select("id, name, color, icon")
    .or(`user_id.is.null,user_id.eq.${user.id}`)
    .order("name");

  return NextResponse.json({ categories: data ?? [] });
}
