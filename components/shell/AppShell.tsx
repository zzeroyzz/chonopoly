"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { ShellSidebar } from "./ShellSidebar";
import { MobileTopBar } from "./MobileTopBar";
import { BottomTabBar } from "./BottomTabBar";
import { buildSections, sectionForPath, visibleSections } from "./sections";
import { rememberSectionPath } from "./sectionMemory";
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
  asRoutes?: boolean;

  /** Active destination id within the current section, when the page tracks one. */
  activeNavId: string | null;
  onNavigate: (id: string) => void;

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
 * The bottom bar is scoped to the section you're in — which section is derived
 * from the route and nowhere else, so it can't disagree with the URL. Desktop
 * ignores the scoping entirely and lists every section in the sidebar.
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
  asRoutes = false,
  activeNavId,
  onNavigate,
  sidebarContent,
  sidebarFooter,
  children,
  overlays,
}: Props) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const sections = buildSections({ asRoutes });
  const section = sectionForPath(pathname, sections);
  const sectionCount = visibleSections(sections).length;

  // Remember where we were so More can bring the user back here rather than to
  // the section's front door.
  useEffect(() => {
    const query = searchParams.toString();
    rememberSectionPath(section.id, query ? `${pathname}?${query}` : (pathname ?? ""));
  }, [section.id, pathname, searchParams]);

  return (
    <div className="flex min-h-screen overflow-x-hidden bg-(--color-base) text-(--color-text-primary)">

      <ShellSidebar
        sectionLabel={sectionLabel ?? section.label}
        userProfile={userProfile}
        onboardingCompleted={onboardingCompleted}
        onProfileClick={onProfileClick}
        contextSwitcher={contextSwitcher}
        sections={visibleSections(sections)}
        activeSectionId={section.id}
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

      <BottomTabBar
        navItems={section.items}
        activeNavId={activeNavId}
        onNavigate={onNavigate}
        showMore={sectionCount > 1}
      />

      {overlays}
    </div>
  );
}
