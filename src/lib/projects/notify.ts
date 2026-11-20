import "server-only";
import { and, eq, isNotNull } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { clientContacts } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { PROJECT_HEALTH_LABELS, type ProjectUpdate } from "@/lib/db/types";
import { sendEmail } from "@/lib/mail/send";

/** Prévient par email les membres de l'espace d'un nouveau point d'avancement. */
export async function notifyMembersOfUpdate(db: Db, project: { id: string; name: string; client_id: string }, update: ProjectUpdate) {
  const members = await db
    .select({ email: clientContacts.email, name: clientContacts.full_name })
    .from(clientContacts)
    .where(and(eq(clientContacts.client_id, project.client_id), eq(clientContacts.portal_access, true), eq(clientContacts.notify_email, true), isNotNull(clientContacts.email)));
  let sent = 0;
  for (const m of members) {
    try {
      await sendEmail({
        to: m.email!,
        subject: `[${project.name}] Point d'avancement : ${PROJECT_HEALTH_LABELS[update.health]}`,
        paragraphs: [`Bonjour ${m.name.split(" ")[0]},`, `Voici le dernier point d'avancement du projet « ${project.name} » : ${PROJECT_HEALTH_LABELS[update.health].toLowerCase()}.`],
        quote: update.body.length > 1500 ? `${update.body.slice(0, 1500)}…` : update.body,
        link: { url: `${env().NEXT_PUBLIC_APP_URL}/portail/projets/${project.id}`, label: "Voir le projet" },
        kind: "project-update",
      });
      sent++;
    } catch (err) {
      console.error("[projet] email de point d'avancement", err);
    }
  }
  return sent;
}
