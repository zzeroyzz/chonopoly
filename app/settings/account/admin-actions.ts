"use server";
import { headers } from "next/headers";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

export type UserRow = {
  id: string;
  email: string;
  username: string | null;
  role: "admin" | "user";
  created_at: string;
  invited: boolean;
};

function serviceClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

async function assertAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated.");

  const { data } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (data?.role !== "admin") throw new Error("Not authorized.");
  return user;
}

export async function listUsers(): Promise<UserRow[]> {
  const caller = await assertAdmin();
  const admin = serviceClient();

  const [{ data: authData }, { data: profiles }] = await Promise.all([
    admin.auth.admin.listUsers({ perPage: 1000 }),
    admin.from("profiles").select("id, username, role"),
  ]);

  const profileMap = new Map(
    (profiles ?? []).map((p) => [p.id, p])
  );

  return (authData?.users ?? [])
    .filter((u) => u.id !== caller.id)
    .map((u) => ({
      id: u.id,
      email: u.email ?? "",
      username: profileMap.get(u.id)?.username ?? null,
      role: (profileMap.get(u.id)?.role ?? "user") as "admin" | "user",
      created_at: u.created_at,
      // invited_at is set for email invites; treat as pending until email is confirmed
      invited: !!u.invited_at && !u.email_confirmed_at,
    }))
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
}

export async function updateUserRole(
  userId: string,
  role: "admin" | "user"
): Promise<{ error?: string }> {
  await assertAdmin();
  const admin = serviceClient();

  const { error } = await admin
    .from("profiles")
    .update({ role })
    .eq("id", userId);

  if (error) return { error: error.message };
  return {};
}

export async function updateUserProfile(
  userId: string,
  fields: { username?: string }
): Promise<{ error?: string }> {
  await assertAdmin();
  const admin = serviceClient();

  const { error } = await admin
    .from("profiles")
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq("id", userId);

  if (error) {
    if (error.code === "23505") return { error: "That username is already taken." };
    return { error: error.message };
  }
  return {};
}

export async function deleteUser(userId: string): Promise<{ error?: string }> {
  await assertAdmin();
  const admin = serviceClient();

  // Delete related rows first to avoid FK constraint violations on auth user delete
  await admin.from("chapter_progress").delete().eq("user_id", userId);
  await admin.from("profiles").delete().eq("id", userId);

  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) return { error: error.message };
  return {};
}

async function getRedirectOrigin(): Promise<string> {
  const headersList = await headers();
  return (
    process.env.NEXT_PUBLIC_SITE_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ??
    headersList.get("origin") ??
    `https://${headersList.get("host")}`
  );
}

async function sendInvite(email: string): Promise<{ error?: string }> {
  const admin = serviceClient();
  const origin = await getRedirectOrigin();

  const { error } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${origin}/auth/callback?next=/setup`,
  });
  if (error) return { error: error.message };
  return {};
}

export async function inviteUser(email: string): Promise<{ error?: string }> {
  await assertAdmin();
  return sendInvite(email);
}

export async function resendInvite(email: string): Promise<{ error?: string }> {
  await assertAdmin();
  return sendInvite(email);
}
