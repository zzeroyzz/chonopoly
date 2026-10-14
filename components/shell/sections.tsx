import {
  LayoutDashboard,
  Calculator,
  Building2,
  Wrench,
  ListChecks,
  CheckSquare,
} from "lucide-react";
import { type ShellNavItem } from "./types";

/**
 * The app is two products, not one with tabs: Tools and the CRM. Five bottom-bar
 * slots at 375px cannot hold everything flat, so the bar is scoped to whichever
 * section you're in and More switches between sections.
 *
 * Section is derived from the route prefix and nothing else. There is no
 * "current section" state variable, because a state variable can disagree with
 * the URL and then the bar lies about where you are.
 *
 * Finances was the third product. It moved to its own project, so its section
 * and the `asRoutes` flag that existed only to drive its `?tab=` switching are
 * both gone.
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

export function buildSections(): AppSection[] {
  return [
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
