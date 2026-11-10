import { defineConfig } from "drizzle-kit";

// drizzle-kit ne lit pas .env.local tout seul (`vercel env pull` l'écrit).
try {
  process.loadEnvFile(".env.local");
} catch {
  // Pas de fichier : les variables viennent de l'environnement.
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  // Les migrations passent par la connexion directe (sans PgBouncer) quand elle existe.
  dbCredentials: { url: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? "" },
});
