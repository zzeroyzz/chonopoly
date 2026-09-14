import { Suspense } from "react";
import { MorePage } from "@/components/shell/MorePage";

export default function More() {
  return (
    <Suspense>
      <MorePage />
    </Suspense>
  );
}
