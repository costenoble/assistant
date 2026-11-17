import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireOwner } from "@/lib/auth/require-owner";
import { projects } from "@/lib/db/schema";

// Derrière la connexion : jamais pré-générée au build.
export const dynamic = "force-dynamic";

/** Ancienne page d'un projet : on ouvre l'espace, filtré sur ce projet. */
export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const parsed = z.uuid().safeParse((await params).id);
  if (!parsed.success) notFound();
  const { db } = await requireOwner();
  const [p] = await db.select({ client_id: projects.client_id }).from(projects).where(eq(projects.id, parsed.data));
  if (!p) notFound();
  redirect(`/espaces/${p.client_id}?projet=${parsed.data}`);
}
