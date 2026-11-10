import { NextResponse, type NextRequest } from "next/server";
import { requireOwner } from "@/lib/auth/require-owner";
import { exchangeCode } from "@/lib/microsoft/oauth";
import { syncMicrosoft } from "@/lib/microsoft/graph-sync";

export async function GET(request: NextRequest) {
  const { db } = await requireOwner();
  const params = request.nextUrl.searchParams;
  const settings = new URL("/reglages", request.url);

  const expected = request.cookies.get("ms_oauth_state")?.value;
  if (!expected || params.get("state") !== expected) {
    settings.searchParams.set("ms", "state-invalide");
    return NextResponse.redirect(settings);
  }
  const code = params.get("code");
  if (!code) {
    settings.searchParams.set("ms", params.get("error") ?? "refuse");
    return NextResponse.redirect(settings);
  }

  try {
    await exchangeCode(db, code);
    await syncMicrosoft(db);
    settings.searchParams.set("ms", "ok");
  } catch (err) {
    console.error("[microsoft callback]", err);
    settings.searchParams.set("ms", "erreur");
  }
  const response = NextResponse.redirect(settings);
  response.cookies.delete({ name: "ms_oauth_state", path: "/api/auth/microsoft" });
  return response;
}
