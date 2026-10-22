import { redirect } from "next/navigation";

/** The hub is gone. The pipeline is home. */
export default function HubRedirect() {
  redirect("/properties");
}
