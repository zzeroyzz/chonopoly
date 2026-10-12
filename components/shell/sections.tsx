import {
  LayoutDashboard,
  LayoutGrid,
  Search,
  PieChart,
  Calculator,
  Building2,
  Wallet,
  Wrench,
  ListChecks,
  CheckSquare,
} from "lucide-react";
import { type ShellNavItem } from "./types";

/**
 * The app is three products, not one with tabs: Finances, Tools, and (soon) the
 * CRM. Five bottom-bar slots at 375px cannot hold all of them flat, so the bar
 * is scoped to whichever section you're in and More switches between sections.
 *
 * Section is derived from the route prefix and nothing else. There is no
 * "current section" state variable, because a state variable can disagree with
 * the URL and then the bar lies about where you are.
 */

export interface AppSection {
  id: string;
  label: string;
  icon: ShellNavItem["icon"];
  /** Route prefix that puts you in this section. Longest match wins. */
  prefix: string;
  /** Where More sends you when you've never been here before. */
  defaultHref: string;
  /**
   * The section's own destinations — what fills the bottom bar while you're
   * inside it. Items without an href are views the page switches internally.
   */
  items: ShellNavItem[];
}

/** Finances destinations, which BudgetClient drives internally via `?tab=`. */
function financesItems(asRoutes: boolean): ShellNavItem[] {
  const href = (tab: string) => (asRoutes ? `/finances?tab=${tab}` : undefined);
  return [
    { id: "overview", icon: <LayoutDashboard size={16} />, label: "Overview", href: href("overview") },
    { id: "manage", icon: <LayoutGrid size={16} />, label: "Manage", href: href("manage") },
    { id: "transactions", icon: <Search size={16} />, label: "Transactions", href: href("transactions") },
    { id: "analytics", icon: <PieChart size={16} />, label: "Analytics", href: href("analytics") },
  ];
}

/**
 * Only routes that exist go in here — a nav item pointing at a 404 is worse than
 * a missing one. Cash flow (/cash-flow) and Markets (/markets) join this list as
 * each ships; nothing else has to change when they do.
 */
const TOOLS_ITEMS: ShellNavItem[] = [
  { id: "mortgage", icon: <Calculator size={16} />, label: "Mortgage", href: "/mortgage" },
];

/**
 * CRM destinations. Three, because phase 1 has three screens — the pipeline
 * list, the tasks due, and the dashboard. Property detail isn't here: it's
 * reached by tapping a row, not by navigating to it cold.
 */
const CRM_ITEMS: ShellNavItem[] = [
  { id: "pipeline", icon: <ListChecks size={16} />, label: "Pipeline", href: "/crm" },
  { id: "tasks", icon: <CheckSquare size={16} />, label: "My tasks", href: "/crm/tasks" },
  { id: "dashboard", icon: <LayoutDashboard size={16} />, label: "Dashboard", href: "/crm/dashboard" },
];

/**
 * `asRoutes` only affects the finances group: inside /finances those four are
 * views and the shell hands their id back to BudgetClient, which is what keeps
 * its `?tab=` switching and view-local resets working. Seen from anywhere else
 * they have to be real links.
 */
export function buildSections({ asRoutes }: { asRoutes: boolean }): AppSection[] {
  return [
    {
      id: "finances",
      label: "Finances",
      icon: <Wallet size={16} />,
      prefix: "/finances",
      defaultHref: "/finances?tab=overview",
      items: financesItems(asRoutes),
    },
    {
      id: "tools",
      label: "Tools",
      icon: <Wrench size={16} />,
      prefix: "/mortgage",
      defaultHref: "/mortgage",
      items: TOOLS_ITEMS,
    },
    {
      id: "crm",
      label: "CRM",
      icon: <Building2 size={16} />,
      prefix: "/crm",
      defaultHref: "/crm",
      items: CRM_ITEMS,
    },
  ];
}

/** Every route that belongs to Tools, since they don't share one prefix. */
const TOOLS_PREFIXES = ["/mortgage", "/cash-flow", "/markets"];

/** Which section a pathname belongs to. Longest prefix wins. */
export function sectionForPath(pathname: string | null, sections: AppSection[]): AppSection {
  const path = pathname ?? "";

  if (TOOLS_PREFIXES.some((p) => path.startsWith(p))) {
    return sections.find((s) => s.id === "tools")!;
  }

  const match = sections
    .filter((s) => path.startsWith(s.prefix))
    .sort((a, b) => b.prefix.length - a.prefix.length)[0];

  return match ?? sections[0];
}

/** Sections that have somewhere to go — the CRM is hidden until it has routes. */
export function visibleSections(sections: AppSection[]): AppSection[] {
  return sections.filter((s) => s.items.length > 0);
}
