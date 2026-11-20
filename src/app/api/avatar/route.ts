import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getViewer } from "@/lib/files/viewer";
import { StorageNotConfigured } from "@/lib/files/storage";
import { setAvatar } from "@/lib/profile/service";
import { avatarUrl } from "@/lib/profile/avatar-url";

export const dynamic = "force-dynamic";

const MAX = 1024 * 1024;
const TYPES = ["image/webp", "image/png", "image/jpeg"];

/** Nouvelle photo de profil (déjà recadrée en carré et réduite par le navigateur). */
export async function POST(req: Request) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Connexion requise." }, { status: 401 });
  const file = (await req.formData().catch(() => null))?.get("file");
  if (!(file instanceof File) || !TYPES.includes(file.type)) return NextResponse.json({ error: "Choisissez une image (JPEG, PNG ou WebP)." }, { status: 400 });
  if (file.size > MAX) return NextResponse.json({ error: "Image trop lourde (1 Mo maximum après réduction)." }, { status: 400 });
  try {
    const who = viewer.kind === "owner" ? ({ kind: "owner" } as const) : ({ kind: "member", email: viewer.contact.email! } as const);
    const key = await setAvatar(viewer.db, who, Buffer.from(await file.arrayBuffer()), file.type);
    revalidatePath("/", "layout");
    return NextResponse.json({ url: avatarUrl(viewer.kind === "owner" ? "moi" : viewer.contact.id, key) });
  } catch (err) {
    if (err instanceof StorageNotConfigured) return NextResponse.json({ error: err.message }, { status: 400 });
    console.error("[avatar]", err);
    return NextResponse.json({ error: "L'envoi a échoué. Réessayez." }, { status: 500 });
  }
}

export async function DELETE() {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Connexion requise." }, { status: 401 });
  await setAvatar(viewer.db, viewer.kind === "owner" ? { kind: "owner" } : { kind: "member", email: viewer.contact.email! }, null);
  revalidatePath("/", "layout");
  return NextResponse.json({ ok: true });
}
