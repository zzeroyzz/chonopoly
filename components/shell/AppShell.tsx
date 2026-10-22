"use client";

import { type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { ShellSidebar } from "./ShellSidebar";
import { MobileTopBar } from "./MobileTopBar";
import { BottomTabBar } from "./BottomTabBar";
import { NAV_DESTINATIONS, destinationForPath } from "./sections";
import { type ShellUserProfile } from "./types";

/** The one name this app has. It was passed in from eleven places, identically. */
const APP_NAME = "Park Hawkins Capital";

interface Props {
  /** Read once by the layout that owns this, not by each page. */
  userProfile: ShellUserProfile | null;
  children: ReactNode;
}

/**
 * App frame: desktop sidebar, mobile top bar, mobile bottom tab bar, and the
 * safe-area padding they need.
 *
 * Rendered once, by `app/(shell)/layout.tsx`, and not re-rendered on
 * navigation. Which destination is active is derived from the route inside
 * the client components below, so it still follows the URL.
 *
 * Seven per-page slots used to hang off this — mobileActions, contextSwitcher,
 * sidebarContent, sidebarFooter, overlays, mobileBadge, sectionLabel. Not one
 * of them was passed by any page. They are gone rather than carried up into
 * the layout, where they would have needed portals to feed props nobody sends.
 */
export function AppShell({ userProfile, children }: Props) {
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
   * scroll box that could not scroll. All eleven pages already carry that
   * container, so capping the shell at the viewport is what they were written
   * for. dvh rather than vh because the owner is on a phone, where 100vh is
   * taller than the visible area under the browser toolbar.
   */
  return (
    <div className="flex h-dvh overflow-x-hidden bg-(--color-base) text-(--color-text-primary)">

      <ShellSidebar
        sectionLabel={active?.label ?? APP_NAME}
        userProfile={userProfile}
        destinations={NAV_DESTINATIONS}
        activeDestinationId={active?.id ?? null}
      />

      {/* Main content — min-w-0 prevents flex child from overflowing on mobile */}
      <main className="flex-1 min-w-0 flex flex-col overflow-hidden pt-14 lg:pt-0">
        <MobileTopBar />
        {children}
      </main>

      <BottomTabBar
        destinations={NAV_DESTINATIONS}
        activeDestinationId={active?.id ?? null}
        userProfile={userProfile}
      />
    </div>
  );
}
