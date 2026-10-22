"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";

interface InviteInfo {
  team_name: string;
  role: string;
}

const ROLE_LABELS: Record<string, string> = {
  org_admin: "Admin",
  team_manager: "Manager",
  team_member: "Member",
};

export default function InvitePage() {
  const router = useRouter();
  const params = useParams<{ token: string }>();
  const token = params.token;

  const [invite, setInvite] = useState<InviteInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notAuthed, setNotAuthed] = useState(false);
  const [declined, setDeclined] = useState(false);
  const [acting, setActing] = useState(false);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/teams/invite/${token}`)
      .then(async res => {
        if (res.status === 401) { setNotAuthed(true); return; }
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error((body as { error?: string }).error ?? "Invalid or expired invite.");
        }
        const data = await res.json() as { team_name: string; role: string };
        setInvite({ team_name: data.team_name, role: data.role });
      })
      .catch(e => setError(e instanceof Error ? e.message : "Failed to load invite."))
      .finally(() => setLoading(false));
  }, [token]);

  async function accept() {
    setActing(true);
    try {
      const res = await fetch(`/api/teams/invite/${token}/accept`, { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? "Failed to join team.");
      }
      router.push("/properties");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to join team.");
      setActing(false);
    }
  }

  async function decline() {
    setActing(true);
    try {
      await fetch(`/api/teams/invite/${token}/decline`, { method: "POST" });
      setDeclined(true);
    } catch {
      // Gracefully show declined even if request fails
      setDeclined(true);
    } finally {
      setActing(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-(--color-base) p-4">
      <div className="bg-(--color-surface) border border-(--color-border-default) rounded-[var(--radius-lg)] p-8 w-full max-w-sm shadow-xl text-center">

        {loading && (
          <p className="text-sm text-(--color-text-secondary)">Loading invite…</p>
        )}

        {!loading && notAuthed && (
          <>
            <p className="text-[15px] font-semibold text-(--color-text-primary) mb-2">Sign in to join</p>
            <p className="text-sm text-(--color-text-secondary) mb-6">
              You need to sign in before you can accept this invite.
            </p>
            <Link
              href={`/login?redirect=/invite/${token}`}
              className="inline-block bg-(--color-accent) text-white rounded-[var(--radius-md)] px-5 py-2.5 text-sm font-medium hover:opacity-90 transition-opacity"
            >
              Sign in
            </Link>
          </>
        )}

        {!loading && error && !notAuthed && (
          <>
            <p className="text-[15px] font-semibold text-(--color-text-primary) mb-2">Invite not found</p>
            <p className="text-sm text-red-400">{error}</p>
            <Link href="/properties" className="inline-block mt-4 text-sm text-(--color-accent) hover:opacity-80 transition-opacity">
              Go home
            </Link>
          </>
        )}

        {!loading && declined && !error && (
          <>
            <p className="text-[15px] font-semibold text-(--color-text-primary) mb-2">Invite declined</p>
            <p className="text-sm text-(--color-text-secondary)">You&apos;ve declined the team invite. No action has been taken.</p>
            <Link href="/properties" className="inline-block mt-4 text-sm text-(--color-accent) hover:opacity-80 transition-opacity">
              Go home
            </Link>
          </>
        )}

        {!loading && invite && !declined && !error && !notAuthed && (
          <>
            <p className="text-[10px] uppercase tracking-widest text-(--color-text-tertiary) mb-3">Team invite</p>
            <p className="text-[20px] font-bold text-(--color-text-primary) mb-1">{invite.team_name}</p>
            <p className="text-sm text-(--color-text-secondary) mb-6">
              You&apos;ve been invited to join as{" "}
              <span className="text-(--color-text-primary) font-medium">
                {ROLE_LABELS[invite.role] ?? invite.role}
              </span>
              .
            </p>
            <div className="flex flex-col gap-3">
              <button
                onClick={accept}
                disabled={acting}
                className="bg-(--color-accent) text-white rounded-[var(--radius-md)] px-5 py-2.5 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-40 w-full"
              >
                {acting ? "Joining…" : "Join team"}
              </button>
              <button
                onClick={decline}
                disabled={acting}
                className="text-sm text-(--color-text-tertiary) hover:text-(--color-text-primary) transition-colors disabled:opacity-40"
              >
                Decline
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
