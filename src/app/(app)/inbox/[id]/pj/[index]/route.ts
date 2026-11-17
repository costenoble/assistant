import { notFound } from "next/navigation";
import { z } from "zod";
import { requireOwner } from "@/lib/auth/require-owner";
import { getMail } from "@/lib/mail/queries";
import { fetchAttachment, MailFetchError } from "@/lib/mail/message-store";

export const dynamic = "force-dynamic";

/** Téléchargement d'une pièce jointe, récupérée sur le serveur mail à la demande. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string; index: string }> }) {
  const { id, index } = await ctx.params;
  const itemId = z.uuid().safeParse(id);
  const i = z.coerce.number().int().min(0).max(500).safeParse(index);
  if (!itemId.success || !i.success) notFound();
  const { db } = await requireOwner();
  const mail = await getMail(db, itemId.data);
  if (!mail) notFound();
  try {
    const a = await fetchAttachment(mail.email, i.data);
    // Toujours en téléchargement, jamais affichée dans l'onglet de Cockpit (un HTML joint ne s'exécute pas ici).
    return new Response(new Uint8Array(a.content), {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(a.filename)}`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    if (err instanceof MailFetchError) return new Response(err.message, { status: 502 });
    throw err;
  }
}
