import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { rm } from "node:fs/promises";
import path from "node:path";
import type { Db } from "@/lib/db";
import { clientContacts, clients, projects } from "@/lib/db/schema";
import { createTestDb } from "@/test/db";
import { addTicketMessage, createTicket } from "@/lib/tickets/service";
import { checkFile, safeFilename } from "./rules";
import { attachPending, attachmentForViewer, FileError, listTicketAttachments, uploadAttachment } from "./service";
import { getFile } from "./storage";
import type { Viewer } from "./viewer";

let db: Db;
let ws: string, other: string, marcId: string, julieId: string, intrusId: string;
const png = (name = "capture.png") => new File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3])], name, { type: "image/png" });
const owner = (): Viewer => ({ kind: "owner", db });
const member = (id: string, clientIds: string[]): Viewer => ({ kind: "member", db, contact: { id } as never, clientIds });

beforeEach(async () => {
  db = await createTestDb();
  const [a, b] = await db.insert(clients).values([{ name: "Semaphors", slug: "semaphors" }, { name: "Autre", slug: "autre" }]).returning();
  [ws, other] = [a!.id, b!.id];
  const c = await db
    .insert(clientContacts)
    .values([
      { client_id: ws, full_name: "Marc", portal_access: true },
      { client_id: ws, full_name: "Julie", portal_access: true },
      { client_id: other, full_name: "Intrus", portal_access: true },
    ])
    .returning();
  [marcId, julieId, intrusId] = [c[0]!.id, c[1]!.id, c[2]!.id];
});
afterAll(() => rm(path.join(process.cwd(), ".data", "uploads"), { recursive: true, force: true }));

describe("règles des fichiers", () => {
  it("types et tailles", () => {
    expect(checkFile({ name: "a.png", type: "image/png", size: 10 })).toBeNull();
    expect(checkFile({ name: "a.svg", type: "image/svg+xml", size: 10 })).toMatch(/non accepté/);
    expect(checkFile({ name: "a.html", type: "text/html", size: 10 })).toMatch(/non accepté/);
    expect(checkFile({ name: "gros.pdf", type: "application/pdf", size: 5 * 1024 * 1024 })).toMatch(/4 Mo/);
    expect(safeFilename("../../etc/passwd", "text/plain")).toBe("passwd.txt");
    expect(safeFilename("Capture d'écran 2026.png", "image/png")).toBe("Capture d_écran 2026.png");
  });
});

describe("pièces jointes", () => {
  it("un membre joint une capture à son commentaire ; toi et Julie la voyez, l'intrus non", async () => {
    const t = await createTicket(db, { kind: "task", clientId: ws, contactId: marcId, author: "client", subject: "Bug", body: "-" });
    const a = await uploadAttachment(member(marcId, [ws]), { ticketId: t.id }, png());
    expect(a.pending).toBe(true);
    // En attente : seulement Marc.
    expect(await attachmentForViewer(member(julieId, [ws]), a.id)).toBeNull();
    expect(await attachmentForViewer(member(marcId, [ws]), a.id)).not.toBeNull();
    const { message } = await addTicketMessage(db, t.id, { author: "client", contactId: marcId, body: "Voir la capture" });
    expect(await attachPending(db, [a.id], { ticketId: t.id, clientId: ws, messageId: message.id, uploadedBy: "client", contactId: marcId })).toBe(1);
    expect(await attachmentForViewer(member(julieId, [ws]), a.id)).not.toBeNull();
    expect(await attachmentForViewer(owner(), a.id)).not.toBeNull();
    expect(await attachmentForViewer(member(intrusId, [other]), a.id)).toBeNull();
    expect(await getFile(a.storage_key)).toBeInstanceOf(Buffer);
    expect((await listTicketAttachments(db, t.id, { portal: true })).map((x) => x.message_id)).toEqual([message.id]);
  });

  it("on ne rattache pas le fichier de quelqu'un d'autre", async () => {
    const t = await createTicket(db, { kind: "task", clientId: ws, author: "admin", subject: "T", body: "-" });
    const mine = await uploadAttachment(member(marcId, [ws]), { ticketId: t.id }, png());
    const { message } = await addTicketMessage(db, t.id, { author: "client", contactId: julieId, body: "x" });
    expect(await attachPending(db, [mine.id], { ticketId: t.id, clientId: ws, messageId: message.id, uploadedBy: "client", contactId: julieId })).toBe(0);
    expect(await attachPending(db, [mine.id], { ticketId: t.id, clientId: ws, messageId: message.id, uploadedBy: "admin", contactId: null })).toBe(0);
  });

  it("fichier d'une note interne : invisible des membres", async () => {
    const t = await createTicket(db, { kind: "task", clientId: ws, author: "admin", subject: "T", body: "-" });
    const a = await uploadAttachment(owner(), { ticketId: t.id }, png("interne.png"));
    const { message } = await addTicketMessage(db, t.id, { author: "admin", body: "note", internal: true });
    await attachPending(db, [a.id], { ticketId: t.id, clientId: ws, messageId: message.id, uploadedBy: "admin", contactId: null });
    expect(await attachmentForViewer(member(marcId, [ws]), a.id)).toBeNull();
    expect(await listTicketAttachments(db, t.id, { portal: true })).toEqual([]);
    expect(await listTicketAttachments(db, t.id, { portal: false })).toHaveLength(1);
  });

  it("projet en brouillon : ni envoi ni lecture pour un membre", async () => {
    const [draft] = await db.insert(projects).values({ client_id: ws, name: "Secret", status: "draft" }).returning();
    const t = await createTicket(db, { kind: "task", clientId: ws, projectId: draft!.id, author: "admin", subject: "T", body: "-" });
    await expect(uploadAttachment(member(marcId, [ws]), { ticketId: t.id }, png())).rejects.toBeInstanceOf(FileError);
    const a = await uploadAttachment(owner(), { ticketId: t.id }, png());
    await attachPending(db, [a.id], { ticketId: t.id, clientId: ws, messageId: null, uploadedBy: "admin", contactId: null });
    expect(await attachmentForViewer(member(marcId, [ws]), a.id)).toBeNull();
  });

  it("capture jointe à la création d'une demande (avant que la tâche existe)", async () => {
    const a = await uploadAttachment(member(marcId, [ws]), { workspaceId: ws }, png());
    await expect(uploadAttachment(member(marcId, [ws]), { workspaceId: other }, png())).rejects.toBeInstanceOf(FileError);
    const t = await createTicket(db, { kind: "request", clientId: ws, contactId: marcId, author: "client", subject: "Bug", body: "-" });
    expect(await attachPending(db, [a.id], { ticketId: t.id, clientId: ws, messageId: null, uploadedBy: "client", contactId: marcId })).toBe(1);
    expect((await listTicketAttachments(db, t.id, { portal: true })).map((x) => x.filename)).toEqual(["capture.png"]);
  });
});
