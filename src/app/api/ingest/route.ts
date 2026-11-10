import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { extractBearer, hashApiKey } from "@/lib/ingest/keys";
import { ingestBodySchema, normalizePriority, normalizeStatus } from "@/lib/ingest/schema";
import { recomputePriorities, upsertItems } from "@/lib/items/repo";
import type { Source } from "@/lib/db/types";

/**
 * POST /api/ingest
 * Authorization: Bearer ck_<slug>_<secret>
 * { "items": [{ "external_id": "...", "title": "...", "priority": "high", "due_at": "..." }] }
 *
 * Idempotent : renvoyer le même external_id met à jour l'item existant.
 * Pour clore un item côté SaaS : { "external_id": "...", "title": "...", "status": "done" }.
 */
export async function POST(request: NextRequest) {
  const key = extractBearer(request.headers.get("authorization"));
  if (!key) return NextResponse.json({ error: "missing_api_key" }, { status: 401 });

  const db = createAdminClient();
  const { data: source } = await db
    .from("sources")
    .select("*")
    .eq("api_key_hash", hashApiKey(key))
    .eq("kind", "saas")
    .maybeSingle<Source>();
  if (!source || !source.active) return NextResponse.json({ error: "invalid_api_key" }, { status: 401 });

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = ingestBodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation_error", issues: parsed.error.issues }, { status: 422 });
  }

  try {
    const ids = await upsertItems(
      db,
      source.owner_id,
      source,
      parsed.data.items.map((i) => ({
        external_id: i.external_id,
        kind: i.kind,
        title: i.title,
        body: i.body,
        url: i.url,
        context: i.context,
        source_priority: normalizePriority(i.priority),
        due_at: i.due_at,
        starts_at: i.starts_at,
        ends_at: i.ends_at,
        status: normalizeStatus(i.status),
        initial_status: "todo",
        metadata: { ...i.metadata, source: source.slug },
      })),
    );
    await recomputePriorities(db, source.owner_id);
    await db.from("sources").update({ last_sync_at: new Date().toISOString(), last_error: null }).eq("id", source.id);
    return NextResponse.json({ upserted: ids.size, ids: Object.fromEntries(ids) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown_error";
    await db.from("sources").update({ last_error: message }).eq("id", source.id);
    return NextResponse.json({ error: "ingest_failed" }, { status: 500 });
  }
}
