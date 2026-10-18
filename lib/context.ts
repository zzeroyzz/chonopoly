import { createClient as createServiceClient } from "@supabase/supabase-js";
import { type Database } from "./supabase/database.types";

export interface RequestContext {
  type: "personal" | "team";
  id: string;
}

/**
 * Typed against the generated schema (`lib/supabase/database.types.ts`), so a
 * column that does not exist is a compile error instead of a 500. Regenerate
 * with `npm run db:types` after every migration.
 */
function db() {
  return createServiceClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function resolveContext(
  rawType: string | null | undefined,
  rawId: string | null | undefined,
  userId: string
): Promise<RequestContext | null> {
  const type = rawType === "team" ? "team" : "personal";

  if (type === "personal") {
    // Always use the authenticated user's ID — ignore any passed context_id
    return { type: "personal", id: userId };
  }

  if (!rawId) return null;

  try {
    const { data } = await db()
      .from("team_members")
      .select("team_id")
      .eq("team_id", rawId)
      .eq("user_id", userId)
      .maybeSingle();

    if (!data) return null;
    return { type: "team", id: rawId };
  } catch {
    return null;
  }
}

/**
 * Whether this user may spend a RentCast request that the cache would
 * otherwise have covered.
 *
 * A forced refresh costs one of a shared monthly allowance, so it is the
 * owner's call. In a personal context the user IS the owner. In a team context
 * only `org_owner` can force one — a team here can include agents and
 * assistants, and the quota is not theirs to spend.
 *
 * Reads the role rather than trusting anything the client sent.
 */
export async function canForceRentCastRefresh(
  ctx: RequestContext,
  userId: string
): Promise<boolean> {
  if (ctx.type === "personal") return ctx.id === userId;

  try {
    const { data } = await db()
      .from("team_members")
      .select("role")
      .eq("team_id", ctx.id)
      .eq("user_id", userId)
      .maybeSingle();

    return data?.role === "org_owner";
  } catch {
    // Fails closed. Being unable to confirm authority is not authority.
    return false;
  }
}
