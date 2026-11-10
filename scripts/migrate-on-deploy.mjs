// Lancé par Vercel avant `next build` (script "vercel-build").
// Applique les migrations de drizzle/ à la base, en production uniquement :
// un déploiement de preview partage la même base et ne doit pas la modifier.
// Si une migration échoue, le build échoue et l'ancienne version reste en ligne.
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

if (process.env.VERCEL_ENV !== "production") {
  console.log(`[migrate] ignoré (VERCEL_ENV=${process.env.VERCEL_ENV ?? "non défini"})`);
  process.exit(0);
}

const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!url) {
  console.error("[migrate] DATABASE_URL manquante : connecte la base Neon au projet Vercel.");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: url, max: 1 });
try {
  await migrate(drizzle(pool), { migrationsFolder: "drizzle" });
  console.log("[migrate] base à jour");
} finally {
  await pool.end();
}
