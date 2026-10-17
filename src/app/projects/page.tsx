import { redirect } from "next/navigation";

// Old bookmarks land on the new Home; Headquarters stays at /headquarters and the original page at /projects/legacy.
export const dynamic = "force-dynamic";

export default function ProjectsPage() {
  redirect("/");
}
