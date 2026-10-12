import { Suspense } from "react";
import { HubPage } from "@/components/hub/HubPage";

export default function Hub() {
  return (
    <Suspense>
      <HubPage />
    </Suspense>
  );
}
