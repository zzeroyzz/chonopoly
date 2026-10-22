import { Suspense } from "react";
import { MyTasksPage } from "@/components/crm/MyTasksPage";

export default function CrmTasksPage() {
  return (
    <Suspense>
      <MyTasksPage />
    </Suspense>
  );
}
