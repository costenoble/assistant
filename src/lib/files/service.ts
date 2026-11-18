import "server-only";
import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray, isNull, or } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { attachments, clients, ticketMessages, tickets } from "@/lib/db/schema";
import type { Attachment } from "@/lib/db/types";
import { getPortalTicket } from "@/lib/auth/access";
import { MAX_FILES_PER_MESSAGE, checkFile, safeFilename } from "./rules";
import { deleteFile, putFile } from "./storage";
import type { Viewer } from "./viewer";

/**
 * Pièces jointes des tâches et de leurs messages. Envoi en deux temps : le
 * fichier est stocké et enregistré « en attente », puis rattaché au message
 * (ou à la tâche) quand le formulaire est validé.
 */

export class FileError extends Error {}

/** La tâche est-elle visible de cette personne ? Renvoie son espace, ou null. */
export async function ticketAccess(viewer: Viewer, ticketId: string): Promise<{ clientId: string } | null> {
  if (viewer.kind === "owner") {
    const [t] = await viewer.db.select({ client_id: tickets.client_id }).from(tickets).where(eq(tickets.id, ticketId));
    return t ? { clientId: t.client_id } : null;
  }
  // Membre : mêmes règles que le portail (ses espaces, jamais un projet en brouillon).
  const t = await getPortalTicket(viewer.db, viewer.clientIds, ticketId);
  return t ? { clientId: t.client_id } : null;
}

/** Cible d'un envoi : une tâche existante, ou un espace (tâche pas encore créée). */
export type UploadTarget = { ticketId: string } | { workspaceId: string };

export async function uploadAttachment(viewer: Viewer, target: UploadTarget, file: File): Promise<Attachment> {
  const ticketId = "ticketId" in target ? target.ticketId : null;
  let clientId: string;
  if (ticketId) {
    const access = await ticketAccess(viewer, ticketId);
    if (!access) throw new FileError("Tâche introuvable.");
    clientId = access.clientId;
  } else {
    const ws = (target as { workspaceId: string }).workspaceId;
    if (viewer.kind === "member" && !viewer.clientIds.includes(ws)) throw new FileError("Espace introuvable.");
    if (viewer.kind === "owner") {
      const [c] = await viewer.db.select({ id: clients.id }).from(clients).where(eq(clients.id, ws));
      if (!c) throw new FileError("Espace introuvable.");
    }
    clientId = ws;
  }
  const problem = checkFile(file);
  if (problem) throw new FileError(problem);
  const filename = safeFilename(file.name, file.type);
  const key = `${ticketId ? `tickets/${ticketId}` : `espaces/${clientId}`}/${randomUUID()}-${filename}`;
  await putFile(key, Buffer.from(await file.arrayBuffer()), file.type);
  const [row] = await viewer.db
    .insert(attachments)
    .values({
      client_id: clientId,
      ticket_id: ticketId,
      filename,
      content_type: file.type,
      size: file.size,
      storage_key: key,
      uploaded_by: viewer.kind === "owner" ? "admin" : "client",
      contact_id: viewer.kind === "member" ? viewer.contact.id : null,
    })
    .returning();
  return row!;
}

/**
 * Rattache des fichiers « en attente » au message (ou à la tâche si messageId
 * est null). Seuls ceux envoyés par la même personne pour la même tâche sont pris.
 */
export async function attachPending(
  db: Db,
  ids: string[],
  target: { ticketId: string; clientId: string; messageId: string | null; uploadedBy: "admin" | "client"; contactId: string | null },
) {
  const wanted = [...new Set(ids)].slice(0, MAX_FILES_PER_MESSAGE);
  if (!wanted.length) return 0;
  const rows = await db
    .update(attachments)
    .set({ ticket_id: target.ticketId, message_id: target.messageId, pending: false })
    .where(
      and(
        inArray(attachments.id, wanted),
        // Envoyé pour cette tâche, ou pour son espace avant qu'elle existe.
        or(eq(attachments.ticket_id, target.ticketId), and(isNull(attachments.ticket_id), eq(attachments.client_id, target.clientId))),
        eq(attachments.pending, true),
        eq(attachments.uploaded_by, target.uploadedBy),
        target.contactId ? eq(attachments.contact_id, target.contactId) : isNull(attachments.contact_id),
      ),
    )
    .returning({ id: attachments.id });
  return rows.length;
}

/** Pièces jointes visibles d'une tâche ; côté membre, jamais celles d'une note interne. */
export async function listTicketAttachments(db: Db, ticketId: string, opts: { portal: boolean }) {
  return db
    .select({
      id: attachments.id,
      message_id: attachments.message_id,
      filename: attachments.filename,
      content_type: attachments.content_type,
      size: attachments.size,
      created_at: attachments.created_at,
    })
    .from(attachments)
    .leftJoin(ticketMessages, eq(ticketMessages.id, attachments.message_id))
    .where(
      and(
        eq(attachments.ticket_id, ticketId),
        eq(attachments.pending, false),
        opts.portal ? or(isNull(attachments.message_id), eq(ticketMessages.internal, false)) : undefined,
      ),
    )
    .orderBy(asc(attachments.created_at));
}
export type AttachmentItem = Awaited<ReturnType<typeof listTicketAttachments>>[number];

/** Une pièce jointe que cette personne a le droit de télécharger, ou null. */
export async function attachmentForViewer(viewer: Viewer, attachmentId: string) {
  const [row] = await viewer.db
    .select({ a: attachments, internal: ticketMessages.internal })
    .from(attachments)
    .leftJoin(ticketMessages, eq(ticketMessages.id, attachments.message_id))
    .where(eq(attachments.id, attachmentId));
  if (!row) return null;
  if (viewer.kind === "owner") return row.a;
  const a = row.a;
  if (row.internal) return null;
  // Un fichier encore en attente n'est visible que de la personne qui l'a envoyé.
  if (a.pending) return a.contact_id === viewer.contact.id && viewer.clientIds.includes(a.client_id) ? a : null;
  if (!a.ticket_id) return null;
  return (await ticketAccess(viewer, a.ticket_id)) ? a : null;
}

/** Retire un fichier encore en attente (retiré du formulaire avant l'envoi), par la personne qui l'a envoyé. */
export async function discardPending(viewer: Viewer, attachmentId: string) {
  const a = await attachmentForViewer(viewer, attachmentId);
  if (!a || !a.pending) return false;
  if (viewer.kind === "owner" ? a.uploaded_by !== "admin" : a.contact_id !== viewer.contact.id) return false;
  await viewer.db.delete(attachments).where(eq(attachments.id, a.id));
  await deleteFile(a.storage_key).catch(() => {});
  return true;
}
