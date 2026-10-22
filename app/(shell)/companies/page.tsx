import { Suspense } from "react";
import { CompaniesPage } from "@/components/crm/CompaniesPage";

export default function CompaniesRoute() {
  return (
    <Suspense>
      <CompaniesPage />
    </Suspense>
  );
}
