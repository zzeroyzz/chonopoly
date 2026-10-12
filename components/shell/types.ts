import { type ReactNode } from "react";

/** A single top-level destination rendered in the sidebar and the mobile tab bar. */
export interface ShellNavItem {
  id: string;
  icon: ReactNode;
  label: string;
  /**
   * Route this item points at, e.g. "/mortgage". When set, the shell navigates
   * there itself. When omitted, the item is a view within the current route and
   * the shell hands the id back to the page via onNavigate — which is how
   * /finances drives its own `?tab=` switching.
   */
  href?: string;
}

/** Minimal profile shape the shell needs to render the avatar and name. */
export interface ShellUserProfile {
  name: string;
  avatarUrl: string | null;
  avatarColor: string | null;
}
