"use client";

import { type ReactNode } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { useShellProfile } from "@/components/shell/useShellProfile";

/**
 * The frame, drawn once.
 *
 * Every page used to render its own `<AppShell>` — eleven of them — so each
 * navigation unmounted the top bar, the sidebar and the bottom bar and built
 * new ones. It was not a document reload (a marker set on `window` survives a
 * tab change, and the navigation entry count stays at 1), but it was a rebuild
 * of everything except the document, which is why it read as one.
 *
 * `layout.md:240`: "Layouts do not re-render on navigation." That is the whole
 * fix. The bar's active tab still follows the route, because that is derived
 * inside client components, and `:242` says those re-render on navigation even
 * when the layout holding them does not.
 *
 * This is a route group, so none of the paths beneath it change. It also nests
 * under `app/layout.tsx` rather than replacing it: `:142` warns that moving
 * between two ROOT layouts forces a full page load, which is the symptom this
 * exists to remove.
 *
 * Routes deliberately left outside: `/`, `login`, `invite`, `reset-password`
 * and `setup`, none of which should carry navigation, and the redirect-only
 * routes, which render nothing at all.
 */
export default function ShellLayout({ children }: { children: ReactNode }) {
  const profile = useShellProfile();

  return <AppShell userProfile={profile}>{children}</AppShell>;
}
