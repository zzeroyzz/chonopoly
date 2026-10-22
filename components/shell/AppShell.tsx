"use client";

import { type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { ShellSidebar } from "./ShellSidebar";
import { MobileTopBar } from "./MobileTopBar";
import { BottomTabBar } from "./BottomTabBar";
import { NAV_DESTINATIONS, destinationForPath } from "./sections";
import { type ShellUserProfile } from "./types";

interface Props {
  /** Sidebar heading. Defaults to the current section's label. */
  sectionLabel?: string;
  /** App name in the mobile top bar. */
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

  /**
   * False inside /finances, where its four destinations are views the page
   * switches internally via `?tab=`. True everywhere else, where they have to
   * be real links.
   */


  /** Feature-specific sidebar body — e.g. the finances bank-account tree. */
  sidebarContent?: ReactNode;
  /** Feature-specific sidebar footer — e.g. refresh + Plaid connect. */
  sidebarFooter?: ReactNode;

  children: ReactNode;
  /** Modals and wizards that sit above the shell. */
  overlays?: ReactNode;
}

/**
 * App frame: desktop sidebar, mobile top bar, mobile bottom tab bar, and the
 * safe-area padding they need.
 *
 * The bottom bar is scoped to the module you're in — which module is derived
 * from the route and nowhere else, so it can't disagree with the URL — and its
 * fifth slot goes home to the hub. Desktop ignores the scoping and lists every
 * module in the sidebar.
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
  sidebarContent,
  sidebarFooter,
  children,
  overlays,
}: Props) {
  const pathname = usePathname();

  // Derived from the route and nothing else. A state variable can disagree with
  // the URL, and then the bar lies about where you are.
  const active = destinationForPath(pathname);

  // Section memory went with the sections. The bar holds every destination now,
  // so there is no "go back to where I was in that module" to remember.

  /*
   * h-dvh, not min-h-screen.
   *
   * min-h-screen let the shell grow with its content, so <main> grew too and
   * the document scrolled — which meant every page's own overflow-y-auto
   * container never scrolled, and every sticky inside one was inert, having a
   * scroll box that could not scroll. All ten pages already carry that
   * container, so capping the shell at the viewport is what they were written
   * for. dvh rather than vh because the owner is on a phone, where 100vh is
   * taller than the visible area under the browser toolbar.
   */
  return (
    <div className="flex h-dvh overflow-x-hidden bg-(--color-base) text-(--color-text-primary)">

      <ShellSidebar
        sectionLabel={sectionLabel ?? active?.label ?? appName}
        userProfile={userProfile}
        onboardingCompleted={onboardingCompleted}
        onProfileClick={onProfileClick}
        contextSwitcher={contextSwitcher}
        destinations={NAV_DESTINATIONS}
        activeDestinationId={active?.id ?? null}
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

      <BottomTabBar
        destinations={NAV_DESTINATIONS}
        activeDestinationId={active?.id ?? null}
        userProfile={userProfile}
      />

      {overlays}
    </div>
  );
}
