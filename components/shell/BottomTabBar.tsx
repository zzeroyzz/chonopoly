"use client";

import Link from "next/link";
import { type NavDestination } from "./sections";
import { type ShellUserProfile } from "./types";
import { getAvatarColors } from "@/lib/avatar";

interface Props {
  destinations: NavDestination[];
  /** Null on routes outside the shell. */
  activeDestinationId: string | null;
  /** Drawn in the `isYou` slot. Null before it loads, and the icon stands in. */
  userProfile?: ShellUserProfile | null;
}

/**
 * Mobile bottom tab bar — lg+ uses the sidebar instead.
 *
 * Five slots is the ceiling at 375px, and the app now has exactly five
 * destinations, so the bar holds all of them. No section switcher and no More
 * drawer: those existed to fit three products into five slots, and there is one
 * product now.
 *
 * Plain links rather than router pushes — a nav item should be openable in a
 * new tab, and middle-click should work.
 */
export function BottomTabBar({ destinations, activeDestinationId, userProfile }: Props) {
  return (
    <nav
      className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-(--color-base) border-t border-(--color-border-subtle)"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      aria-label="Main"
    >
      <div className="h-14 flex items-stretch">
        {destinations.map((d) => {
          const active = d.id === activeDestinationId;
          return (
            <Link
              key={d.id}
              href={d.href}
              aria-current={active ? "page" : undefined}
              aria-label={d.isYou ? d.label : undefined}
              data-testid={`nav-${d.id}`}
              className="flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors"
              style={{
                color: active ? "var(--color-accent)" : "var(--color-text-tertiary)",
              }}
            >
              {/* The add action reads as an action, not a place. */}
              <span
                className={
                  d.isAction
                    ? "flex items-center justify-center w-7 h-7 rounded-full bg-(--color-accent) text-(--color-base)"
                    : ""
                }
              >
                {d.isYou ? <YouAvatar profile={userProfile ?? null} active={active} /> : d.icon}
              </span>
              {!d.isYou && <span className="text-[10px] leading-none">{d.label}</span>}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

/**
 * Your photograph, in the last slot.
 *
 * It falls back to initials and then to the plain icon, because the bar has to
 * draw before the profile request lands and a slot that appears late moves
 * everything beside it under a thumb already on its way down.
 */
function YouAvatar({ profile, active }: { profile: ShellUserProfile | null; active: boolean }) {
  const colors = getAvatarColors(profile?.avatarColor ?? null);
  const initials = (profile?.name ?? "").trim().slice(0, 2).toUpperCase();

  return (
    <span
      className={`flex items-center justify-center w-7 h-7 rounded-(--radius-pill) overflow-hidden border ${
        active ? "border-(--color-accent)" : colors.border
      } ${colors.bg}`}
    >
      {profile?.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={profile.avatarUrl} alt="" className="w-full h-full object-cover" />
      ) : (
        <span className={`text-[10px] font-semibold ${colors.text}`}>{initials || "\u00b7\u00b7"}</span>
      )}
    </span>
  );
}
