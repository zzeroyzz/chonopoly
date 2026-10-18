import MortgageCalculator from "@/components/mortgage/MortgageCalculator";

/**
 * A new financing analysis for one house.
 *
 * The house's UUID is the route, which is the whole point: the binding comes
 * from the path rather than from a typed address, so it cannot be lost, cannot
 * be retyped differently, and survives a reload. Saving here writes an analysis
 * onto this property_id and never reaches upsertProperty.
 *
 * No Suspense boundary: the binding arrives as a prop, so nothing in the tree
 * reads useSearchParams and nothing suspends. That is what took the bottom nav
 * off screen on /tools/mortgage.
 */
export default async function NewAnalysisPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <MortgageCalculator propertyId={id} />;
}
