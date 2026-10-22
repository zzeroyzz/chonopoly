import { redirect } from "next/navigation";

/** The cross-house task list went with the pipeline. Each house keeps its own,
 *  on its Activity tab. */
export default function CrmTasksRedirect() {
  redirect("/properties");
}
