"use client";

import { useRouter } from "next/navigation";
import { AppShell } from "@/components/shell/AppShell";
import { AddLeadForm } from "@/components/crm/AddLeadForm";
import { useCrmContext } from "@/components/crm/useCrmContext";

/**
 * Add a house.
 *
 * Wraps the existing single-address form rather than replacing it — batch add
 * is Phase 2, and a half-built batch form would be worse than the one that
 * works. The form already routes through upsertProperty and puts the house on
 * the pipeline, which is all this needs to do today.
 */
export function AddPropertyPage() {
  const router = useRouter();
  const { ctx } = useCrmContext();

  return (
    <AppShell
      appName="Park Hawkins Capital"
      userProfile={null}
      onboardingCompleted={null}
      onProfileClick={() => router.push("/settings/account")}
    >
      <div className="overflow-y-auto flex-1 w-full px-5 py-4 pb-24 lg:pb-8">
        <h1 className="text-[18px] font-semibold mb-1 text-(--color-text-primary)">Add a house</h1>
        <p className="text-[12px] text-(--color-text-secondary) mb-5 leading-relaxed">
          One address for now. Pasting a list of them arrives with the screening
          table.
        </p>
        {ctx && <AddLeadForm ctx={ctx} onAdded={() => router.push("/pipeline")} />}
      </div>
    </AppShell>
  );
}
