import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { getAuth } from "./auth";

/** Utilisateur connecté (ou null). Une seule lecture en base par requête. */
export const getSessionUser = cache(async () => {
  const result = await getAuth().api.getSession({ headers: await headers() });
  return result?.user ?? null;
});
