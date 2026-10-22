import { Suspense } from "react";
import { PropertyDetailPage } from "@/components/crm/PropertyDetailPage";

export default async function CrmDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense>
      <PropertyDetailPage entryId={id} />
    </Suspense>
  );
}
