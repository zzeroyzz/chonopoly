"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function login(
  _prevState: string | undefined,
  formData: FormData
): Promise<string | undefined> {
  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithPassword({
    email: formData.get("email") as string,
    password: formData.get("password") as string,
  });

  if (error) return error.message;

  redirect("/app");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function forgotPassword(
  _prevState: { error?: string; sent?: boolean } | undefined,
  formData: FormData
): Promise<{ error?: string; sent?: boolean }> {
  const email = formData.get("email") as string;

  const headersList = await headers();
  const origin =
    headersList.get("origin") ?? `https://${headersList.get("host")}`;

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/reset-password`,
  });

  if (error) return { error: error.message };
  return { sent: true };
}
