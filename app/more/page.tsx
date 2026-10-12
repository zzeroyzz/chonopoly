import { redirect } from "next/navigation";

/** The section switcher became the hub. Kept so old links still land somewhere. */
export default function More() {
  redirect("/app");
}
