import { Building2, Home, Plus, Wrench, User } from "lucide-react";
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
  /**
   * Drawn as your avatar, with no caption under it.
   *
   * A photograph of you needs no word saying it is you, and "Settings" was the
   * wrong word anyway — behind it are your income, your debts and your
   * account, which are not settings in the sense anyone means. `label` stays
   * because it is still the link's accessible name.
   */
  isYou?: boolean;
}

export const NAV_DESTINATIONS: NavDestination[] = [
  {
    id: "properties",
    label: "Properties",
    icon: <Home size={16} />,
    // /properties/new belongs to Add, so it is excluded below by longest match.
    matches: ["/properties"],
    href: "/properties",
  },
  {
    id: "companies",
    label: "Companies",
    icon: <Building2 size={16} />,
    // Pipeline was the same rows as Properties arranged by stage, which is
    // why no name for it worked: every honest one was either jargon or a word
    // already true of the other tab. This is a different noun — Properties is
    // houses and whether the numbers work, this is who has houses.
    href: "/companies",
    matches: ["/companies", "/pipeline", "/crm"],
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
    label: "You",
    icon: <User size={16} />,
    // The hub, not one of the four areas behind it. Landing on
    // /settings/profile meant the bar's last slot opened a form about debt.
    href: "/settings",
    matches: ["/settings", "/profile"],
    isYou: true,
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
