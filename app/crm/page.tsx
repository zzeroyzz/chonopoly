import { redirect } from "next/navigation";

/** The pipeline moved. Kept so existing links and bookmarks still land. */
export default function CrmRedirect() {
  redirect("/properties");
}
