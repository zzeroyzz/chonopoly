import { Suspense } from "react";
import { PipelinePage } from "@/components/crm/PipelinePage";

export default function CrmPage() {
  return (
    <Suspense>
      <PipelinePage />
    </Suspense>
  );
}
