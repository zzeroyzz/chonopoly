import MortgageCalculator from "@/components/mortgage/MortgageCalculator";

/**
 * One existing analysis on one house.
 *
 * Both ids come from the path, so the analysis opens bound to the house it
 * belongs to. Saving under the same label updates this analysis and the
 * database trigger snapshots the previous state as a new version, rather than
 * inserting a second row.
 */
export default async function AnalysisPage({
  params,
}: {
  params: Promise<{ id: string; analysisId: string }>;
}) {
  const { id, analysisId } = await params;
  return <MortgageCalculator propertyId={id} scenarioId={analysisId} />;
}
