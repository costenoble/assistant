import { notFound } from "next/navigation";
import { z } from "zod";
import { getViewer } from "@/lib/files/viewer";
import { getFile } from "@/lib/files/storage";
import { avatarKeyFor, getOwnerProfile } from "@/lib/profile/service";

export const dynamic = "force-dynamic";

/** Photo de profil : toi (« moi ») ou un membre que la personne connectée a le droit de voir. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const viewer = await getViewer();
  if (!viewer) return new Response("Connexion requise.", { status: 401 });
  let key: string | null;
  if (id === "moi") key = (await getOwnerProfile(viewer.db)).avatar_key;
  else {
    const parsed = z.uuid().safeParse(id);
    if (!parsed.success) notFound();
    key = await avatarKeyFor(viewer.db, viewer.kind === "owner" ? { kind: "owner" } : { kind: "member", clientIds: viewer.clientIds }, parsed.data);
  }
  if (!key) notFound();
  const body = await getFile(key);
  if (!body) notFound();
  const type = key.endsWith(".png") ? "image/png" : key.endsWith(".jpg") ? "image/jpeg" : "image/webp";
  const payload: BodyInit = Buffer.isBuffer(body) ? new Uint8Array(body) : (body as ReadableStream<Uint8Array>);
  return new Response(payload, {
    headers: { "Content-Type": type, "X-Content-Type-Options": "nosniff", "Cache-Control": "private, max-age=86400" },
  });
}
