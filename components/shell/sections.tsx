import { ListChecks, Home, Plus, Wrench, Settings } from "lucide-react";
import { type ShellNavItem } from "./types";

/**
 * The five places you can go.
 *
 * This replaced a section model where the bottom bar was scoped to whichever
 * module you were in, and a More drawer switched between them. That existed
 * because the app was three products sharing a frame. It is one product now —
 * find a house, run the numbers, work the deal — so the bar holds the whole
 * app and nothing needs a drawer.
 *
 * Which destination is active is derived from the route prefix and nothing
 * else. A "current section" state variable can disagree with the URL, and then
 * the bar lies about where you are.
 */

export interface NavDestination extends ShellNavItem {
  href: string;
  /**
   * Route prefixes that light this destination up, longest match first. Old
   * routes are listed alongside new ones so a redirect in flight still
   * highlights the right tab.
   */
  matches: string[];
  /** The add action, drawn as an action rather than a place. */
  isAction?: boolean;
}

export const NAV_DESTINATIONS: NavDestination[] = [
  {
    id: "pipeline",
    label: "Pipeline",
    icon: <ListChecks size={16} />,
    href: "/pipeline",
    matches: ["/pipeline", "/crm"],
  },
  {
    id: "properties",
    label: "Properties",
    icon: <Home size={16} />,
    href: "/properties",
    // /properties/new belongs to Add, so it is excluded below by longest match.
    matches: ["/properties"],
  },
  {
    id: "add",
    label: "Add",
    icon: <Plus size={18} />,
    href: "/properties/new",
    matches: ["/properties/new"],
    isAction: true,
  },
  {
    id: "tools",
    label: "Tools",
    icon: <Wrench size={16} />,
    // Only built calculators. A nav item pointing at a 404 is worse than a
    // missing one, which is why cash flow and markets are absent rather than
    // present and disabled.
    href: "/tools/mortgage",
    matches: ["/tools", "/mortgage"],
  },
  {
    id: "settings",
    label: "Settings",
    icon: <Settings size={16} />,
    href: "/settings/profile",
    matches: ["/settings", "/profile"],
  },
];

/**
 * Which destination the current path belongs to.
 *
 * Longest prefix wins, so /properties/new resolves to Add rather than
 * Properties. Returns null on routes outside the shell, like /login.
 */
export function destinationForPath(pathname: string | null): NavDestination | null {
  const path = pathname ?? "";

  let best: NavDestination | null = null;
  let bestLength = -1;

  for (const destination of NAV_DESTINATIONS) {
    for (const prefix of destination.matches) {
      if ((path === prefix || path.startsWith(`${prefix}/`)) && prefix.length > bestLength) {
        best = destination;
        bestLength = prefix.length;
      }
    }
  }

  return best;
}
