import { Suspense } from "react";
import { DashboardPage } from "@/components/crm/DashboardPage";

export default function CrmDashboardPage() {
  return (
    <Suspense>
      <DashboardPage />
    </Suspense>
  );
}
