/* eslint-disable @next/next/no-img-element */
"use client";

import Link from "next/link";
import { getAvatarColors } from "@/lib/avatar";
import { type ShellUserProfile } from "./types";
import { type NavDestination } from "./sections";

interface Props {
  /** Label shown at the top of the sidebar, e.g. "Finances". */
  sectionLabel: string;
  userProfile: ShellUserProfile | null;

  /** The five destinations, the same list the mobile bar renders. */
  destinations: NavDestination[];
  /** Which one the current route belongs to; null outside the shell. */
  activeDestinationId: string | null;
}

export function ShellSidebar({
  sectionLabel,
  userProfile,
  destinations,
  activeDestinationId,
}: Props) {
  return (
    <aside
      className="hidden lg:flex lg:flex-col w-56 shrink-0 min-h-screen self-stretch bg-(--color-base) border-r border-(--color-border-subtle) overflow-hidden"
      style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.03'/%3E%3C/svg%3E")`,
        backgroundSize: "200px 200px",
      }}
    >
      {/* Section label — /finances is the root route, no back arrow */}
      <div className="px-4 pt-5 pb-3 border-b border-(--color-border-subtle)">
        <span className="text-[10px] text-(--color-text-disabled) uppercase tracking-[0.1em] font-medium">{sectionLabel}</span>
      </div>

      {/* User profile — full area is clickable */}
      {userProfile && (() => {
        const c = getAvatarColors(userProfile.avatarColor);
        const initials = userProfile.name ? userProfile.name.slice(0, 2).toUpperCase() : "··";
        return (
          <button
            onClick={() => { window.location.href = "/settings"; }}
            className="group w-full text-left px-4 py-3 hover:bg-(--color-border-subtle) rounded-[var(--radius-md)] transition-colors"
          >
            <div className="flex items-center gap-2.5">
              <div className={`w-8 h-8 rounded-full shrink-0 border overflow-hidden flex items-center justify-center ${c.bg} ${c.border}`}>
                {userProfile.avatarUrl
                  ? <img src={userProfile.avatarUrl} alt="" className="w-full h-full object-cover" />
                  : <span className={`${c.text} font-(--font-mono) font-bold text-[10px]`}>{initials}</span>
                }
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold text-(--color-text-primary) font-(--font-body) truncate leading-tight">{userProfile.name || "You"}</p>
                {/* The onboarding progress bar that used to sit here is gone.
                    It rendered only when onboardingCompleted was non-null, and
                    every one of the eleven pages passed null, so it never did. */}
                <p className="text-[11px] text-(--color-text-secondary) mt-0.5 group-hover:opacity-0 transition-opacity">All set up</p>
              </div>
              <span className="text-[10px] text-(--color-text-tertiary) opacity-0 group-hover:opacity-100 transition-opacity shrink-0">→</span>
            </div>
          </button>
        );
      })()}

      {/* TODO: mobile — context switcher not accessible on mobile nav; needs a home in ProfilePanel or a mobile sheet */}

      {/* The same five destinations the mobile bar shows. Desktop has the room
          for labels, so nothing is abbreviated or hidden behind a drawer. */}
      <nav className="px-4 py-2">
        {destinations.map((d) => {
          const isActive = d.id === activeDestinationId;
          return (
            <Link
              key={d.id}
              href={d.href}
              aria-current={isActive ? "page" : undefined}
              data-testid={`sidenav-${d.id}`}
              className={`w-full flex items-center gap-[10px] h-9 text-[13px] transition-colors ${
                isActive
                  ? "text-(--color-accent) font-semibold"
                  : "text-(--color-text-secondary) font-normal hover:text-(--color-text-primary)"
              }`}
            >
              <span className={isActive ? "text-(--color-accent)" : "text-(--color-text-secondary)"}>
                {d.icon}
              </span>
              {d.label}
            </Link>
          );
        })}
      </nav>

      {/* Feature-specific body — always flex-1 so the footer stays anchored */}
      <div className="px-4 flex-1 min-h-0 overflow-y-auto">
      </div>

      {/* Bottom actions */}
      <div className="mt-auto px-4 py-4 border-t border-(--color-border-subtle) space-y-1">
      </div>
    </aside>
  );
}
