import { type ReactNode } from "react";

/** A single top-level destination rendered in the sidebar and the mobile tab bar. */
export interface ShellNavItem {
  id: string;
  icon: ReactNode;
  label: string;
}

/** Minimal profile shape the shell needs to render the avatar and name. */
export interface ShellUserProfile {
  name: string;
  avatarUrl: string | null;
  avatarColor: string | null;
}
