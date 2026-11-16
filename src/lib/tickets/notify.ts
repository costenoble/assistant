import "server-only";
import { eq } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { clientContacts, clients } from "@/lib/db/schema";
import type { Ticket } from "@/lib/db/types";
import { env } from "@/lib/env";
import { sendEmail } from "@/lib/mail/send";

/**
 * Emails liés aux tickets. Un envoi raté ne doit jamais faire échouer
 * l'action : le message est déjà enregistré, on journalise et on continue.
 */
async function safeSend(mail: Parameters<typeof sendEmail>[0]) {
  try {
    await sendEmail(mail);
  } catch (err) {
    console.error("[tickets] email non envoyé :", err);
  }
}

const excerpt = (s: string) => (s.length > 1500 ? `${s.slice(0, 1500)}…` : s);

/** À l'admin : nouvelle demande, ou nouvelle réponse d'un client. */
export async function notifyOwnerOfClientMessage(
  db: Db,
  ticket: Ticket,
  body: string,
  kind: "new" | "reply",
) {
  const [[client], [contact]] = await Promise.all([
    db.select({ name: clients.name }).from(clients).where(eq(clients.id, ticket.client_id)),
    ticket.contact_id
      ? db.select({ name: clientContacts.full_name }).from(clientContacts).where(eq(clientContacts.id, ticket.contact_id))
      : Promise.resolve([]),
  ]);
  const who = [contact?.name, client?.name].filter(Boolean).join(" · ");
  await safeSend({
    to: env().OWNER_EMAIL,
    subject: `[#${ticket.number}] ${kind === "new" ? "Nouvelle demande" : "Réponse"} — ${ticket.subject}`,
    paragraphs: [
      `${who || "Un client"} ${kind === "new" ? "a ouvert une demande" : "a répondu"}${ticket.urgent ? " (signalée bloquante)" : ""} :`,
      excerpt(body),
    ],
    link: { url: `${env().NEXT_PUBLIC_APP_URL}/tickets/${ticket.id}`, label: "Ouvrir le ticket" },
    kind: "ticket-owner",
  });
}

/** Au client : réponse de l'admin (jamais pour une note interne). */
export async function notifyClientOfReply(db: Db, ticket: Ticket, body: string) {
  if (!ticket.contact_id) return;
  const [contact] = await db
    .select({ email: clientContacts.email, name: clientContacts.full_name, portal: clientContacts.portal_access })
    .from(clientContacts)
    .where(eq(clientContacts.id, ticket.contact_id));
  // Pas d'email à quelqu'un qui ne peut plus ouvrir son espace.
  if (!contact?.email || !contact.portal) return;
  const resolved = ticket.status === "resolved";
  await safeSend({
    to: contact.email,
    subject: `${resolved ? "Demande résolue" : "Réponse à votre demande"} #${ticket.number} — ${ticket.subject}`,
    paragraphs: [`Bonjour ${contact.name.split(" ")[0]},`, excerpt(body)],
    link: { url: `${env().NEXT_PUBLIC_APP_URL}/portail/demandes/${ticket.id}`, label: "Voir et répondre dans votre espace client" },
    footer: resolved
      ? "Cette demande est marquée comme résolue. Si ce n'est pas le cas, répondez depuis votre espace client : elle sera rouverte."
      : "Merci de répondre depuis votre espace client plutôt que par email : votre réponse sera suivie plus vite.",
    kind: "ticket-client",
  });
}
