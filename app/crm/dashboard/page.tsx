import { redirect } from "next/navigation";

/** The stage dashboard went with the pipeline. */
export default function CrmDashboardRedirect() {
  redirect("/properties");
}
