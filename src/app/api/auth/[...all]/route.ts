import { toNextJsHandler } from "better-auth/next-js";
import { getAuth } from "@/lib/auth/auth";

/**
 * Seul le GET est exposé : il sert à valider le lien magique reçu par email.
 * La demande de lien et la déconnexion passent par nos Server Actions
 * (src/app/login/actions.ts), qui contrôlent qui a le droit de se connecter.
 */
export const GET = (request: Request) => toNextJsHandler(getAuth()).GET(request);
