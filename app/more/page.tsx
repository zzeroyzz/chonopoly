import { redirect } from "next/navigation";

/** The section switcher is gone — the bottom bar holds the whole app now. */
export default function MoreRedirect() {
  redirect("/pipeline");
}
