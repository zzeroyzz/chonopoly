import { redirect } from "next/navigation";

/**
 * The rental tool is Phase 5. Until it exists this goes to the pipeline rather
 * than to a page that explains it is not built yet.
 */
export default function CashFlowRedirect() {
  redirect("/pipeline");
}
