"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOwner } from "@/lib/auth/require-owner";
import { TICKET_STATUSES } from "@/lib/db/types";
import { notifyClientOfReply } from "@/lib/tickets/notify";
import { addTicketMessage, getTicketRow, setTicketStatus } from "@/lib/tickets/service";

export type ReplyState = { error?: string; message?: string } | null;

const id = z.uuid();

/** Pages qui affichent l'état d'un ticket. */
function refreshTicket(ticketId: string) {
  revalidatePath(`/tickets/${ticketId}`);
  revalidatePath("/tickets");
  revalidatePath("/espaces", "layout");
  revalidatePath("/");
}

export async function replyToTicket(_prev: ReplyState, formData: FormData): Promise<ReplyState> {
  const { db } = await requireOwner();
  const tid = id.safeParse(formData.get("ticket_id"));
  if (!tid.success) return { error: "Ticket introuvable" };
  const ticketId = tid.data;
  const body = z.string().trim().min(1, "Message vide").max(20_000).safeParse(formData.get("body"));
  if (!body.success) return { error: body.error.issues[0]?.message };
  const internal = formData.get("internal") === "on";
  const intent = internal ? null : formData.get("intent");
  // Demande : « reply » (en attente du client) ou « resolve ». Tâche : « comment », « submit » (à valider) ou « resolve ».
  const resolve = intent === "resolve";
  const status = intent === "submit" ? ("waiting_client" as const) : undefined;

  if (!(await getTicketRow(db, ticketId))) return { error: "Ticket introuvable" };
  const { ticket } = await addTicketMessage(db, ticketId, { author: "admin", body: body.data, internal, resolve, status });
  if (!internal) await notifyClientOfReply(db, ticket, body.data);

  refreshTicket(ticketId);
  const task = ticket.kind === "task";
  return {
    message: internal
      ? "Note interne ajoutée (invisible du client)."
      : status
        ? "Envoyée en validation. Le client est prévenu par email."
        : resolve
          ? task ? "Tâche marquée faite. Le client est prévenu." : "Réponse envoyée, ticket résolu."
          : task ? "Commentaire envoyé. Le client est prévenu par email." : "Réponse envoyée. Le client est prévenu par email.",
  };
}

export async function changeTicketStatus(ticketId: string, status: string) {
  const { db } = await requireOwner();
  await setTicketStatus(db, id.parse(ticketId), z.enum(TICKET_STATUSES).parse(status));
  refreshTicket(ticketId);
}
