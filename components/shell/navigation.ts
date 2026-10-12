"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { type ShellNavItem } from "./types";

/**
 * Dispatch for a nav item click.
 *
 * Items carrying an `href` are separate routes and the shell navigates to them
 * itself. Items without one are views inside the current route, so the id goes
 * back to the page — /finances uses that to drive its `?tab=` switching, which
 * also resets its own view-local state.
 */
export function useShellNavigate(onNavigate: (id: string) => void) {
  const router = useRouter();

  return useCallback(
    (item: ShellNavItem) => {
      if (item.href) {
        router.push(item.href);
        return;
      }
      onNavigate(item.id);
    },
    [router, onNavigate]
  );
}

/**
 * Route-carrying items are active when the browser is on that route; view items
 * are active when the page says their id is the current view.
 */
export function isNavItemActive(
  item: ShellNavItem,
  activeNavId: string | null,
  pathname: string | null
): boolean {
  // Compare paths only — hrefs may carry a query (e.g. /finances?tab=overview)
  // and usePathname never includes one.
  if (item.href) return pathname === item.href.split("?")[0];
  return activeNavId === item.id;
}
