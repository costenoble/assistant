"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getPortalTicket, resolvePortalTicketTarget } from "@/lib/auth/access";
import { requireClient } from "@/lib/auth/require-client";
import { notifyOwnerOfClientMessage } from "@/lib/tickets/notify";
import { addTicketMessage, createTicket } from "@/lib/tickets/service";

/**
 * Actions du portail. Chacune repart de requireClient() et vérifie, via
 * lib/auth/access, que le contact agit sur ses propres clients et projets.
 */

export type PortalFormState = { error?: string; sent?: number } | null;

const optionalId = z
  .string()
  .optional()
  .transform((v) => v || null)
  .pipe(z.uuid().nullable());

export async function createRequest(_prev: PortalFormState, formData: FormData): Promise<PortalFormState> {
  const { db, contact, clientIds } = await requireClient();
  const parsed = z
    .object({
      subject: z.string().trim().min(3, "Indiquez un objet (3 caractères minimum).").max(200),
      body: z.string().trim().min(1, "Décrivez votre demande.").max(20_000),
      client_id: optionalId,
      project_id: optionalId,
      urgent: z.literal("on").optional(),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Formulaire invalide." };

  const target = await resolvePortalTicketTarget(db, clientIds, {
    clientId: parsed.data.client_id,
    projectId: parsed.data.project_id,
  });
  if (!target) return { error: "Choisissez l'entreprise ou le projet concerné." };

  const ticket = await createTicket(db, {
    clientId: target.clientId,
    projectId: target.projectId,
    contactId: contact.id,
    author: "client",
    subject: parsed.data.subject,
    body: parsed.data.body,
    urgent: parsed.data.urgent === "on",
  });
  await notifyOwnerOfClientMessage(db, ticket, parsed.data.body, "new");
  revalidatePath("/portail");
  redirect(`/portail/demandes/${ticket.id}?envoye=1`);
}

export async function replyToRequest(_prev: PortalFormState, formData: FormData): Promise<PortalFormState> {
  const { db, contact, clientIds } = await requireClient();
  const body = z.string().trim().min(1, "Votre message est vide.").max(20_000).safeParse(formData.get("body"));
  if (!body.success) return { error: body.error.issues[0]?.message };
  const tid = z.uuid().safeParse(formData.get("ticket_id"));
  // Même message qu'un ticket inexistant : on ne révèle pas les demandes des autres clients.
  if (!tid.success || !(await getPortalTicket(db, clientIds, tid.data))) return { error: "Demande introuvable." };

  const { ticket } = await addTicketMessage(db, tid.data, { author: "client", contactId: contact.id, body: body.data });
  await notifyOwnerOfClientMessage(db, ticket, body.data, "reply");
  revalidatePath(`/portail/demandes/${tid.data}`);
  revalidatePath("/portail");
  return { sent: Date.now() };
}
