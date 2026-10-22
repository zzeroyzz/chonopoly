"use client";

import { useEffect, useState } from "react";
import { type ActiveContext } from "@/lib/tenancy";
import { createClient } from "@/lib/supabase/client";

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
