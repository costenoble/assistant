import { afterEach, describe, expect, it, vi } from "vitest";
import { sendPortalInvitation } from "./notify";

describe("invitation à l'espace membre", () => {
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  afterEach(() => log.mockClear());

  it("part au contact, avec le nom du client et le lien de connexion", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://x");
    vi.stubEnv("BETTER_AUTH_SECRET", "x".repeat(32));
    vi.stubEnv("OWNER_EMAIL", "admin@test.dev");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.test");
    vi.stubEnv("CRON_SECRET", "y".repeat(16));
    await sendPortalInvitation({ email: "patron@semaphors.com", full_name: "Jean Patron" }, "Semaphors");
    // Sans SMTP, hors production, l'email est écrit dans le journal.
    const out = log.mock.calls.map((c) => String(c[0])).join("\n");
    expect(out).toContain("À patron@semaphors.com — Votre espace Semaphors est ouvert");
    expect(out).toContain("Bonjour Jean,");
    expect(out).toContain("https://app.test/login");
  });
});
