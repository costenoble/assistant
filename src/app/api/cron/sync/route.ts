import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";
import { extractBearer } from "@/lib/ingest/keys";
import { runFullSync } from "@/lib/sync/run";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

function authorized(request: NextRequest) {
  const token = extractBearer(request.headers.get("authorization"));
  if (!token) return false;
  const a = Buffer.from(token);
  const b = Buffer.from(env().CRON_SECRET);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function handle(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    return NextResponse.json(await runFullSync());
  } catch (err) {
    console.error("[cron/sync]", err);
    return NextResponse.json({ error: "sync_failed" }, { status: 500 });
  }
}

// Vercel Cron appelle en GET, Supabase pg_net en POST.
export const GET = handle;
export const POST = handle;
