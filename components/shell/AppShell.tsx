"use client";

import { type ReactNode } from "react";
import { ShellSidebar } from "./ShellSidebar";
import { MobileTopBar } from "./MobileTopBar";
import { BottomTabBar } from "./BottomTabBar";
import { type ShellNavItem, type ShellUserProfile } from "./types";

interface Props {
  /** Sidebar heading, e.g. "Finances". */
  sectionLabel: string;
  /** App name in the mobile top bar, e.g. "Park Properties". */
  appName: string;
  /** Optional pill under the app name on mobile — the active team, when one is selected. */
  mobileBadge?: string | null;
  /** Feature-specific mobile top-bar actions, e.g. the refresh button. */
  mobileActions?: ReactNode;

  userProfile: ShellUserProfile | null;
  onboardingCompleted: number | null;
  onProfileClick: () => void;

  /**
   * Context switcher slot. Passed by routes that scope data; omitted by routes
   * that don't have any, so nothing dead renders.
   */
  contextSwitcher?: ReactNode;

  navItems: ShellNavItem[];
  activeNavId: string | null;
  onNavigate: (id: string) => void;

  /** Feature-specific sidebar body — e.g. the finances bank-account tree. */
  sidebarContent?: ReactNode;
  /** Feature-specific sidebar footer — e.g. refresh + Plaid connect. */
  sidebarFooter?: ReactNode;

  /** Main content. */
  children: ReactNode;
  /** Modals and wizards that sit above the shell. */
  overlays?: ReactNode;
}

/**
 * App frame: desktop sidebar, mobile top bar, mobile bottom tab bar, and the
 * safe-area padding they need. Everything feature-specific arrives through a
 * slot so no single route's data layer ends up in the shared shell.
 */
export function AppShell({
  sectionLabel,
  appName,
  mobileBadge,
  mobileActions,
  userProfile,
  onboardingCompleted,
  onProfileClick,
  contextSwitcher,
  navItems,
  activeNavId,
  onNavigate,
  sidebarContent,
  sidebarFooter,
  children,
  overlays,
}: Props) {
  return (
    <div className="flex min-h-screen overflow-x-hidden bg-(--color-base) text-(--color-text-primary)">

      <ShellSidebar
        sectionLabel={sectionLabel}
        userProfile={userProfile}
        onboardingCompleted={onboardingCompleted}
        onProfileClick={onProfileClick}
        contextSwitcher={contextSwitcher}
        navItems={navItems}
        activeNavId={activeNavId}
        onNavigate={onNavigate}
        sidebarContent={sidebarContent}
        sidebarFooter={sidebarFooter}
      />

      {/* Main content — min-w-0 prevents flex child from overflowing on mobile */}
      <main className="flex-1 min-w-0 flex flex-col overflow-hidden pt-14 lg:pt-0">
        <MobileTopBar
          appName={appName}
          badge={mobileBadge}
          actions={mobileActions}
          userProfile={userProfile}
          onProfileClick={onProfileClick}
        />
        {children}
      </main>

      <BottomTabBar navItems={navItems} activeNavId={activeNavId} onNavigate={onNavigate} />

      {overlays}
    </div>
  );
}
