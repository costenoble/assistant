import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const path = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": path("./src"),
      // `server-only` lève une erreur hors de Next : neutralisé dans les tests.
      "server-only": path("./src/test/server-only.ts"),
    },
  },
  test: { environment: "node", include: ["src/**/*.test.ts"], testTimeout: 20_000 },
});
