import { redirect } from "next/navigation";

/**
 * A property deep link. The id is carried across rather than dropped — someone
 * following a link to a specific house should land on that house, not on a list.
 */
export default async function CrmPropertyRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/properties/${id}`);
}
