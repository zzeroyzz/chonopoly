import { Suspense } from "react";
import { headers } from "next/headers";
import { getPlaidItems } from "@/lib/supabase/plaid";
import BudgetClient from "@/components/BudgetClient";

export default async function BudgetPage() {
  const headerStore = await headers();
  const userId = headerStore.get("x-user-id") ?? "";

  let connectedAccounts: { itemId: string; institutionName: string | null }[] = [];
  if (userId) {
    try {
      const { data: items } = await getPlaidItems(userId);
      connectedAccounts = items.map((i) => ({ itemId: i.item_id, institutionName: i.institution_name }));
    } catch {
      // plaid_items table may not exist yet — show empty state instead of crashing
    }
  }

  return (
    <Suspense>
      <BudgetClient initialConnected={connectedAccounts} userId={userId} />
    </Suspense>
  );
}
