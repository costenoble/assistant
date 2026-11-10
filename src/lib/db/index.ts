import "server-only";
import { drizzle } from "drizzle-orm/node-postgres";
import type { PgDatabase } from "drizzle-orm/pg-core";
import { Pool } from "pg";
import { env } from "@/lib/env";
import * as schema from "./schema";

/**
 * Type commun à tous les pilotes Postgres de Drizzle : node-postgres en
 * production (Neon), PGlite dans les tests.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Db = PgDatabase<any, typeof schema>;

// Conservé entre les rechargements à chaud de `next dev` pour ne pas multiplier les connexions.
const globalForDb = globalThis as unknown as { cockpitPool?: Pool };

/**
 * Connexion à la base. DATABASE_URL doit être l'URL « pooled » de Neon :
 * chaque instance serverless garde peu de connexions, PgBouncer fait le reste.
 */
export function getDb(): Db {
  globalForDb.cockpitPool ??= new Pool({
    connectionString: env().DATABASE_URL,
    max: 5,
    idleTimeoutMillis: 10_000,
  });
  return drizzle(globalForDb.cockpitPool, { schema });
}

/** Violation d'une contrainte d'unicité (Drizzle enveloppe l'erreur du pilote). */
export function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } } | null;
  return e?.code === "23505" || e?.cause?.code === "23505";
}
