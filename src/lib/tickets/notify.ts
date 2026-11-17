import "server-only";
import { and, eq } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { clientContacts, clients, projects } from "@/lib/db/schema";
import type { Ticket } from "@/lib/db/types";
import { env } from "@/lib/env";
import { sendEmail } from "@/lib/mail/send";

/**
 * Emails liés aux demandes et aux tâches. Un envoi raté ne doit jamais faire
 * échouer l'action : le message est déjà enregistré, on journalise et on continue.
 */
async function safeSend(mail: Parameters<typeof sendEmail>[0]) {
  try {
    await sendEmail(mail);
  } catch (err) {
    console.error("[notify] email non envoyé :", err);
  }
}

const excerpt = (s: string) => (s.length > 1500 ? `${s.slice(0, 1500)}…` : s);
const isTask = (t: Ticket) => t.kind === "task";

async function context(db: Db, ticket: Ticket) {
  const [[client], [contact], [project]] = await Promise.all([
    db.select({ name: clients.name }).from(clients).where(eq(clients.id, ticket.client_id)),
    ticket.contact_id
      ? db.select({ name: clientContacts.full_name }).from(clientContacts).where(eq(clientContacts.id, ticket.contact_id))
      : Promise.resolve([]),
    ticket.project_id
      ? db.select({ name: projects.name }).from(projects).where(eq(projects.id, ticket.project_id))
      : Promise.resolve([]),
  ]);
  return { client: client?.name, contact: contact?.name, project: project?.name };
}

/**
 * À l'admin : nouvelle demande / tâche, commentaire du client, ou validation.
 * `authorName` : le contact qui vient d'écrire (pas forcément l'auteur du ticket).
 */
export async function notifyOwnerOfClientMessage(
  db: Db,
  ticket: Ticket,
  body: string,
  kind: "new" | "reply" | "validated",
  authorName?: string,
) {
  const ctx = await context(db, ticket);
  const who = [authorName ?? ctx.contact, ctx.client].filter(Boolean).join(" · ") || "Un client";
  const what = isTask(ticket)
    ? { new: "Nouvelle tâche", reply: "Commentaire", validated: "Tâche validée" }[kind]
    : { new: "Nouvelle demande", reply: "Réponse", validated: "Validée" }[kind];
  const verb = isTask(ticket)
    ? { new: "vous a confié une tâche", reply: "a commenté", validated: "a validé la tâche" }[kind]
    : { new: "a ouvert une demande", reply: "a répondu", validated: "a validé" }[kind];
  await safeSend({
    to: env().OWNER_EMAIL,
    subject: `[#${ticket.number}] ${what} — ${ticket.subject}`,
    paragraphs: [
      `${who} ${verb}${ctx.project ? ` (projet « ${ctx.project} »)` : ""}${ticket.urgent && kind === "new" ? ", signalée bloquante" : ""}${kind === "validated" ? "." : " :"}`,
    ],
    quote: kind === "validated" ? undefined : excerpt(body),
    link: { url: `${env().NEXT_PUBLIC_APP_URL}/tickets/${ticket.id}`, label: isTask(ticket) ? "Ouvrir la tâche" : "Ouvrir le ticket" },
    kind: "ticket-owner",
  });
}

/**
 * Destinataires côté client : l'auteur s'il a toujours accès ; pour une tâche
 * créée par l'admin, tous les contacts du client qui ont accès au portail.
 */
async function clientRecipients(db: Db, ticket: Ticket) {
  const withAccess = and(eq(clientContacts.portal_access, true));
  if (ticket.contact_id) {
    return db
      .select({ email: clientContacts.email, name: clientContacts.full_name })
      .from(clientContacts)
      .where(and(eq(clientContacts.id, ticket.contact_id), withAccess));
  }
  if (!isTask(ticket)) return [];
  return db
    .select({ email: clientContacts.email, name: clientContacts.full_name })
    .from(clientContacts)
    .where(and(eq(clientContacts.client_id, ticket.client_id), withAccess));
}

/**
 * Au client : réponse ou commentaire de l'admin, tâche soumise à validation, tâche faite,
 * ou nouvelle tâche ajoutée par l'admin (`isNew`). Jamais pour une note interne.
 */
export async function notifyClientOfReply(db: Db, ticket: Ticket, body: string, opts: { isNew?: boolean } = {}) {
  const [recipients, ctx] = await Promise.all([clientRecipients(db, ticket), context(db, ticket)]);
  const url = `${env().NEXT_PUBLIC_APP_URL}/portail/demandes/${ticket.id}`;
  const task = isTask(ticket);
  const subject = task
    ? opts.isNew
      ? `Nouvelle tâche : ${ticket.subject}`
      : ticket.status === "waiting_client"
      ? `À valider : ${ticket.subject}`
      : ticket.status === "resolved"
        ? `Tâche terminée : ${ticket.subject}`
        : `Nouveau commentaire : ${ticket.subject}`
    : `${ticket.status === "resolved" ? "Demande résolue" : "Réponse à votre demande"} #${ticket.number} — ${ticket.subject}`;
  const footer = task
    ? ticket.status === "waiting_client"
      ? "Ouvrez la tâche pour la valider, ou laissez un commentaire si quelque chose ne va pas."
      : undefined
    : ticket.status === "resolved"
      ? "Cette demande est marquée comme résolue. Si ce n'est pas le cas, répondez depuis votre espace client : elle sera rouverte."
      : "Merci de répondre depuis votre espace client plutôt que par email : votre réponse sera suivie plus vite.";

  const intro = task
    ? opts.isNew
      ? `Une nouvelle tâche a été ajoutée${ctx.project ? ` au projet « ${ctx.project} »` : ""} : « ${ticket.subject} ».`
      : ticket.status === "waiting_client"
        ? `La tâche « ${ticket.subject} » est prête et attend votre validation.`
        : ticket.status === "resolved"
          ? `La tâche « ${ticket.subject} » est terminée.`
          : `Nouveau commentaire sur la tâche « ${ticket.subject} » :`
    : ticket.status === "resolved"
      ? `Votre demande n°${ticket.number} est résolue.`
      : `Nous avons répondu à votre demande n°${ticket.number} :`;

  for (const r of recipients) {
    if (!r.email) continue;
    await safeSend({
      to: r.email,
      subject: task && ctx.project ? `[${ctx.project}] ${subject}` : subject,
      paragraphs: [`Bonjour ${r.name.split(" ")[0]},`, intro],
      quote: body.trim() && body.trim() !== ticket.subject ? excerpt(body) : undefined,
      link: { url, label: task ? "Ouvrir la tâche dans votre espace" : "Voir et répondre dans votre espace client" },
      footer,
      kind: "ticket-client",
    });
  }
}

/** Invitation à l'espace client, envoyée quand l'admin ouvre l'accès d'un contact. */
export async function sendPortalInvitation(contact: { email: string; full_name: string }, clientName: string) {
  await sendEmail({
    to: contact.email,
    subject: `Votre espace ${clientName} est ouvert`,
    paragraphs: [
      `Bonjour ${contact.full_name.split(" ")[0]},`,
      `Vous avez désormais accès à l'espace ${clientName}. Vous y suivez l'avancement des projets, vous pouvez confier des tâches, commenter et valider le travail livré.`,
      "Pour vous connecter, indiquez simplement votre adresse email : vous recevrez un lien de connexion. Pas de mot de passe à créer.",
    ],
    link: { url: `${env().NEXT_PUBLIC_APP_URL}/login`, label: "Accéder à mon espace" },
    kind: "invitation",
  });
}

/** Au contact à qui l'admin assigne une tâche. */
export async function notifyAssignee(db: Db, ticket: Ticket) {
  if (!ticket.assignee_contact_id) return;
  const [[contact], ctx] = await Promise.all([
    db
      .select({ email: clientContacts.email, name: clientContacts.full_name, portal: clientContacts.portal_access })
      .from(clientContacts)
      .where(eq(clientContacts.id, ticket.assignee_contact_id)),
    context(db, ticket),
  ]);
  if (!contact?.email || !contact.portal) return;
  await safeSend({
    to: contact.email,
    subject: `${ctx.project ? `[${ctx.project}] ` : ""}Une tâche vous est assignée : ${ticket.subject}`,
    paragraphs: [`Bonjour ${contact.name.split(" ")[0]},`, `La tâche « ${ticket.subject} » vous est maintenant assignée.`],
    link: { url: `${env().NEXT_PUBLIC_APP_URL}/portail/demandes/${ticket.id}`, label: "Ouvrir la tâche" },
    kind: "ticket-client",
  });
}
