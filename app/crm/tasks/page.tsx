import { redirect } from "next/navigation";

export default function CrmTasksRedirect() {
  redirect("/pipeline/tasks");
}
