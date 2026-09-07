/* eslint-disable @next/next/no-img-element */
"use client";

import { type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { getAvatarColors } from "@/lib/avatar";
import { type ShellNavItem, type ShellUserProfile } from "./types";
import { useShellNavigate, isNavItemActive } from "./navigation";

interface Props {
  /** Label shown at the top of the sidebar, e.g. "Finances". */
  sectionLabel: string;
  userProfile: ShellUserProfile | null;
  /** Onboarding steps completed, or null when unknown. Progress bar shows while < 5. */
  onboardingCompleted: number | null;
  onProfileClick: () => void;
  /**
   * Context switcher slot. Routes that scope data (finances, CRM) pass one in;
   * routes that have no data (the mortgage calculator) pass nothing and render none.
   */
  contextSwitcher?: ReactNode;
  navItems: ShellNavItem[];
  /** Secondary destinations. Listed inline here — the sidebar has the room that
   *  the mobile tab bar doesn't, so there's no More indirection on desktop. */
  secondaryNavItems?: ShellNavItem[];
  /** Currently active nav id, or null when the active view isn't a top-level item. */
  activeNavId: string | null;
  onNavigate: (id: string) => void;
  /** Feature-specific sidebar body — e.g. the finances bank-account tree. */
  sidebarContent?: ReactNode;
  /** Feature-specific sidebar footer — e.g. refresh + Plaid connect. */
  sidebarFooter?: ReactNode;
}

export function ShellSidebar({
  sectionLabel,
  userProfile,
  onboardingCompleted,
  onProfileClick,
  contextSwitcher,
  navItems,
  secondaryNavItems = [],
  activeNavId,
  onNavigate,
  sidebarContent,
  sidebarFooter,
}: Props) {
  const pathname = usePathname();
  const navigate = useShellNavigate(onNavigate);

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
        const showProgress = onboardingCompleted !== null && onboardingCompleted < 5;
        return (
          <button
            onClick={onProfileClick}
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
                {showProgress ? (
                  <div className="mt-1.5">
                    <div className="w-12 h-[3px] rounded-full bg-(--color-border-default) overflow-hidden mb-1">
                      <div className="h-full bg-(--color-accent) rounded-full transition-all" style={{ width: `${((onboardingCompleted ?? 0) / 5) * 100}%` }} />
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="w-[5px] h-[5px] rounded-full bg-(--color-accent) pulse-dot shrink-0" />
                      <span className="text-[10px] text-(--color-text-tertiary)">{onboardingCompleted} of 5 complete</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-[11px] text-(--color-text-secondary) mt-0.5 group-hover:opacity-0 transition-opacity">All set up</p>
                )}
              </div>
              <span className="text-[10px] text-(--color-text-tertiary) opacity-0 group-hover:opacity-100 transition-opacity shrink-0">→</span>
            </div>
          </button>
        );
      })()}

      {/* TODO: mobile — context switcher not accessible on mobile nav; needs a home in ProfilePanel or a mobile sheet */}
      {contextSwitcher}

      {/* Nav items */}
      <nav className="px-4 py-2">
        {navItems.map((item) => {
          const { id, icon, label } = item;
          const isActive = isNavItemActive(item, activeNavId, pathname);
          return (
            <button
              key={id}
              onClick={() => navigate(item)}
              className={`w-full flex items-center gap-[10px] h-9 text-[13px] transition-colors ${
                isActive
                  ? "text-(--color-accent) font-semibold"
                  : "text-(--color-text-secondary) font-normal hover:text-(--color-text-primary)"
              }`}
            >
              <span className={isActive ? "text-(--color-accent)" : "text-(--color-text-secondary) group-hover:text-(--color-text-primary)"}>{icon}</span>
              {label}
            </button>
          );
        })}

        {secondaryNavItems.length > 0 && (
          <>
            <hr className="border-(--color-border-subtle) my-2" />
            {secondaryNavItems.map((item) => {
              const { id, icon, label } = item;
              const isActive = isNavItemActive(item, activeNavId, pathname);
              return (
                <button
                  key={id}
                  onClick={() => navigate(item)}
                  className={`w-full flex items-center gap-[10px] h-9 text-[13px] transition-colors ${
                    isActive
                      ? "text-(--color-accent) font-semibold"
                      : "text-(--color-text-secondary) font-normal hover:text-(--color-text-primary)"
                  }`}
                >
                  <span className={isActive ? "text-(--color-accent)" : "text-(--color-text-secondary)"}>{icon}</span>
                  {label}
                </button>
              );
            })}
          </>
        )}
      </nav>

      {/* Feature-specific body — always flex-1 so the footer stays anchored */}
      <div className="px-4 flex-1 min-h-0 overflow-y-auto">
        {sidebarContent}
      </div>

      {/* Bottom actions */}
      <div className="mt-auto px-4 py-4 border-t border-(--color-border-subtle) space-y-1">
        {sidebarFooter}
      </div>
    </aside>
  );
}
