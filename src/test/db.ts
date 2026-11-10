import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import type { Db } from "@/lib/db";
import * as schema from "@/lib/db/schema";

/** Postgres en mémoire avec les vraies migrations : une base neuve par test. */
export async function createTestDb(): Promise<Db> {
  const db = drizzle(new PGlite(), { schema });
  await migrate(db, { migrationsFolder: "drizzle" });
  return db;
}
