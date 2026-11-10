import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ensureAdminRow, isOwnerEmail } from "@/lib/auth/require-owner";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && data.user) {
      if (isOwnerEmail(data.user.email)) {
        await ensureAdminRow(data.user.id);
        return NextResponse.redirect(new URL("/", request.url));
      }
      return NextResponse.redirect(new URL("/portail", request.url));
    }
  }
  return NextResponse.redirect(new URL("/login?error=lien-invalide", request.url));
}
