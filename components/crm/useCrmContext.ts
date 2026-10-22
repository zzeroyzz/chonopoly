"use client";

import { useEffect, useState } from "react";
import { type ActiveContext } from "@/lib/tenancy";
import { loadProfile } from "@/lib/supabase/profile";
import { createClient } from "@/lib/supabase/client";
import { readProfileCache, writeProfileCache } from "@/lib/profile-cache";

export interface ShellProfile {
  name: string;
  avatarUrl: string | null;
  avatarColor: string | null;
  /** Empty until the auth call lands, and on any failure. */
  email: string;
  role: "admin" | "user";
}

/**
 * The CRM reads the same stored context as Finances, under the same key.
 *
 * One context for the whole app, deliberately. A separate CRM context would let
 * the two drift, and "why is Finances on the team but the CRM on personal"
 * isn't a question anyone should have to answer.
 */
export function useCrmContext(): { ctx: ActiveContext | null; ctxParams: string | null } {
  const [ctx, setCtx] = useState<ActiveContext | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let stored: ActiveContext | null = null;
      try {
        const raw = localStorage.getItem("financeContext");
        if (raw) stored = JSON.parse(raw) as ActiveContext;
      } catch {
        stored = null;
      }

      if (stored && (stored.type === "personal" || stored.type === "team") && stored.id) {
        if (!cancelled) setCtx(stored);
        return;
      }

      // No stored context — fall back to personal, which needs the user id.
      try {
        const { data } = await createClient().auth.getUser();
        if (!cancelled && data.user) setCtx({ type: "personal", id: data.user.id });
      } catch {
        // Leave ctx null; the page shows its error state rather than querying
        // with a context it had to guess.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return {
    ctx,
    ctxParams: ctx ? `context_type=${ctx.type}&context_id=${ctx.id}` : null,
  };
}

/**
 * The profile the shell needs for its avatar. Shared by every screen.
 *
 * Seeded from the stale-while-revalidate cache, because the avatar is in the
 * bottom bar on every page now: without it the last slot draws as two dots in
 * a coloured ring for as long as the request takes, on every single load, and
 * it was the owner who noticed. The cache is written below on every refresh
 * and cleared at login, so it cannot show somebody else's face.
 */
export function useShellProfile(): ShellProfile | null {
  const [profile, setProfile] = useState<ShellProfile | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Inside the async body, not the effect's: a synchronous setState in an
      // effect cascades a render, and the cache is only a first paint anyway.
      const cached = readProfileCache();
      if (cached && !cancelled) {
        setProfile({
          name: cached.username,
          avatarUrl: cached.avatarUrl,
          avatarColor: cached.avatarColor,
          email: cached.email,
          role: cached.role,
        });
      }

      try {
        const [p, auth] = await Promise.all([
          loadProfile(),
          createClient().auth.getUser(),
        ]);
        if (!cancelled) {
          const next = {
            name: p.username ?? "",
            avatarUrl: p.avatar_url,
            avatarColor: p.avatar_color ?? "amber",
            email: auth.data.user?.email ?? "",
            role: p.role,
          };
          setProfile(next);
          writeProfileCache({
            initials: next.name.trim().slice(0, 2).toUpperCase(),
            username: next.name,
            email: next.email,
            role: next.role,
            avatarUrl: next.avatarUrl,
            avatarColor: next.avatarColor,
          });
        }
      } catch {
        // The shell renders fine without a profile.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return profile;
}
