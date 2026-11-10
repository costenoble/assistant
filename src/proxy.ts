import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Proxy (ex-middleware, Next 16) : rafraîchit la session Supabase,
 * renvoie vers /login toute requête non authentifiée, et cantonne les
 * comptes clients au portail (/portail). L'admin (OWNER_EMAIL) voit tout.
 * Les routes machine (/api/ingest, /api/cron) ont leur propre auth par clé.
 */
const PUBLIC_PATHS = ["/login", "/auth/callback", "/api/ingest", "/api/cron"];

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (toSet) => {
          for (const { name, value } of toSet) request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of toSet) response.cookies.set(name, value, options);
        },
      },
    },
  );

  const { data } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some((p) => path === p || path.startsWith(`${p}/`));

  if (isPublic) return response;
  if (!data.user) return redirectTo(request, "/login");

  const isOwner = data.user.email?.toLowerCase() === process.env.OWNER_EMAIL?.toLowerCase();
  if (isOwner) return response;

  // Tout autre compte connecté est un contact client potentiel : portail uniquement.
  // requireClient() vérifie ensuite en base qu'il a bien un accès actif.
  const isPortal = path === PORTAL || path.startsWith(`${PORTAL}/`);
  return isPortal ? response : redirectTo(request, PORTAL);
}

const PORTAL = "/portail";

function redirectTo(request: NextRequest, pathname: string) {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|ico)$).*)"],
};
