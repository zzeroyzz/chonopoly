import { Suspense } from "react";
import { CompanyDetailPage } from "@/components/crm/CompanyDetailPage";

export default async function CompanyRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense>
      <CompanyDetailPage companyId={id} />
    </Suspense>
  );
}
