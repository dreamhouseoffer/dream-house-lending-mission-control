import { redirect } from "next/navigation";

// Old bookmarks land on Headquarters; the original page lives at /projects/legacy.
export const dynamic = "force-dynamic";

export default function ProjectsPage() {
  redirect("/headquarters");
}
