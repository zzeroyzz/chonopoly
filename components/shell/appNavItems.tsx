import { LayoutDashboard, LayoutGrid, Search, PieChart, Calculator, User } from "lucide-react";
import { type ShellNavItem } from "./types";

/**
 * Primary destinations — the four that get a permanent slot in the mobile tab
 * bar. The fifth slot is More, which opens the secondary list below.
 *
 * `asRoutes` controls how the finances destinations behave. Inside /finances
 * they're views, so they carry no href and the shell hands their id back to
 * BudgetClient — which is what preserves its `?tab=` switching and the
 * view-local state resets that come with it. From any other route they need to
 * be real links.
 */
export function buildAppNavItems({ asRoutes }: { asRoutes: boolean }): ShellNavItem[] {
  const financesHref = (tab: string) => (asRoutes ? `/finances?tab=${tab}` : undefined);

  return [
    { id: "overview", icon: <LayoutDashboard size={16} />, label: "Overview", href: financesHref("overview") },
    { id: "manage", icon: <LayoutGrid size={16} />, label: "Manage", href: financesHref("manage") },
    { id: "transactions", icon: <Search size={16} />, label: "Transactions", href: financesHref("transactions") },
    { id: "analytics", icon: <PieChart size={16} />, label: "Analytics", href: financesHref("analytics") },
  ];
}

/**
 * Secondary destinations, reached through More.
 *
 * The tab bar holds five items at 375px and no more, so everything past the
 * four primaries lives here. This is the list the CRM's sections will join.
 *
 * Profile appears here as well as on the top-bar avatar — two paths to the same
 * place, deliberately, because the avatar isn't obvious as navigation.
 */
export function buildSecondaryNavItems({ asRoutes }: { asRoutes: boolean }): ShellNavItem[] {
  return [
    { id: "mortgage", icon: <Calculator size={16} />, label: "Mortgage calculator", href: "/mortgage" },
    {
      id: "profile",
      icon: <User size={16} />,
      label: "Profile",
      href: asRoutes ? "/finances?tab=profile" : undefined,
    },
  ];
}
