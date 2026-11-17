import { redirect } from "next/navigation";

// Derrière la connexion : jamais pré-générée au build.
export const dynamic = "force-dynamic";

/** Les projets vivent désormais dans les espaces de travail. */
export default function ProjectsPage() {
  redirect("/espaces");
}
