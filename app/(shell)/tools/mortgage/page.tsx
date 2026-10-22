import { Suspense } from "react";
import MortgageCalculator from "@/components/mortgage/MortgageCalculator";

export default function MortgagePage() {
  return (
    <Suspense>
      <MortgageCalculator />
    </Suspense>
  );
}
