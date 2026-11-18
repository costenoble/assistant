import { notFound } from "next/navigation";
import { z } from "zod";
import { getViewer } from "@/lib/files/viewer";
import { attachmentForViewer } from "@/lib/files/service";
import { isInlineImage } from "@/lib/files/rules";
import { getFile } from "@/lib/files/storage";

export const dynamic = "force-dynamic";

/**
 * Lecture d'une pièce jointe, après contrôle d'accès. Les images courantes
 * s'affichent dans la page ; tout le reste est forcé en téléchargement.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const parsed = z.uuid().safeParse((await ctx.params).id);
  if (!parsed.success) notFound();
  const viewer = await getViewer();
  if (!viewer) return new Response("Connexion requise.", { status: 401 });
  const a = await attachmentForViewer(viewer, parsed.data);
  if (!a) notFound();
  const body = await getFile(a.storage_key);
  if (!body) return new Response("Fichier introuvable.", { status: 404 });
  const download = new URL(req.url).searchParams.has("telecharger") || !isInlineImage(a.content_type);
  const payload: BodyInit = Buffer.isBuffer(body) ? new Uint8Array(body) : (body as ReadableStream<Uint8Array>);
  return new Response(payload, {
    headers: {
      "Content-Type": isInlineImage(a.content_type) ? a.content_type : "application/octet-stream",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(a.filename)}`,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
      "Cache-Control": "private, max-age=3600",
    },
  });
}
