import { NextResponse } from "next/server";
import { z } from "zod";
import { getViewer } from "@/lib/files/viewer";
import { discardPending, FileError, uploadAttachment } from "@/lib/files/service";
import { StorageNotConfigured } from "@/lib/files/storage";

export const dynamic = "force-dynamic";

/** Envoi d'une pièce jointe (toi ou un membre), pour une tâche ou un espace. Renvoie la fiche du fichier. */
export async function POST(req: Request) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Connexion requise." }, { status: 401 });
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Aucun fichier." }, { status: 400 });
  const ticketId = z.uuid().safeParse(form?.get("ticket_id"));
  const workspaceId = z.uuid().safeParse(form?.get("workspace_id"));
  if (!ticketId.success && !workspaceId.success) return NextResponse.json({ error: "Destination manquante." }, { status: 400 });
  try {
    const a = await uploadAttachment(viewer, ticketId.success ? { ticketId: ticketId.data } : { workspaceId: workspaceId.data! }, file);
    return NextResponse.json({ id: a.id, filename: a.filename, size: a.size, content_type: a.content_type });
  } catch (err) {
    if (err instanceof FileError || err instanceof StorageNotConfigured) return NextResponse.json({ error: err.message }, { status: 400 });
    console.error("[fichiers] envoi", err);
    return NextResponse.json({ error: "L'envoi a échoué. Réessaie." }, { status: 500 });
  }
}

/** Retire un fichier encore en attente. */
export async function DELETE(req: Request) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Connexion requise." }, { status: 401 });
  const id = z.uuid().safeParse(new URL(req.url).searchParams.get("id"));
  if (!id.success) return NextResponse.json({ error: "Fichier inconnu." }, { status: 400 });
  return NextResponse.json({ ok: await discardPending(viewer, id.data) });
}
