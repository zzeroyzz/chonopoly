"use client";

import { useEffect, useState } from "react";
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
