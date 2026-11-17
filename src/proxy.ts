import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

/**
 * Proxy (ex-middleware, Next 16) : renvoie vers /login toute requête sans
 * cookie de session. C'est un premier filtre, pas le contrôle d'accès : la
 * session est vérifiée en base, et l'aiguillage admin / portail décidé, par
 * requireOwner() et requireClient() dans chaque page, action et route.
 * Les routes machine (/api/ingest, /api/cron) ont leur propre auth par clé.
 */
// Fichiers de l'app installable (manifeste, service worker, page hors connexion) : sans données, publics,
// pour que le téléphone puisse installer Cockpit et afficher la page hors connexion.
const PUBLIC_PATHS = ["/login", "/api/auth/magic-link", "/api/ingest", "/api/cron", "/sw.js", "/manifest.webmanifest", "/hors-ligne.html"];

export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some((p) => path === p || path.startsWith(`${p}/`));
  if (isPublic || getSessionCookie(request)) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|ico)$).*)"],
};
