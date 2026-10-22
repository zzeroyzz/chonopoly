import { Suspense } from "react";
import { AddPropertyPage } from "@/components/properties/AddPropertyPage";

export default function NewPropertyRoute() {
  return (
    <Suspense>
      <AddPropertyPage />
    </Suspense>
  );
}
