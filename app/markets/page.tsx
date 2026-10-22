import { redirect } from "next/navigation";

/** Market analysis is not built. Until it is, this goes to the pipeline. */
export default function MarketsRedirect() {
  redirect("/properties");
}
