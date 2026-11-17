import { redirect } from "next/navigation";

/** Les projets vivent désormais dans les espaces de travail. */
export default function ProjectsPage() {
  redirect("/espaces");
}
