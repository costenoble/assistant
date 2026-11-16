import { describe, expect, it } from "vitest";
import { buildSnippet, isBulkMail, mailExternalId } from "./parse";

const headers = (h: Record<string, string>) => {
  const m = new Map(Object.entries(h));
  return { get: (k: string) => m.get(k), has: (k: string) => m.has(k) };
};

describe("isBulkMail", () => {
  it("ignore les notifications envoyées par l'app elle-même", () => {
    expect(isBulkMail(headers({ "x-cockpit-notification": "ticket-owner" }), "ryan@cstlab.dev")).toBe(true);
  });

  it("repère les newsletters via List-Unsubscribe", () => {
    expect(isBulkMail(headers({ "list-unsubscribe": "<mailto:x>" }), "news@brand.com")).toBe(true);
  });
  it("repère les expéditeurs no-reply", () => {
    expect(isBulkMail(null, "no-reply@stripe.com")).toBe(true);
    expect(isBulkMail(null, "noreply@github.com")).toBe(true);
  });
  it("repère les réponses automatiques", () => {
    expect(isBulkMail(headers({ "auto-submitted": "auto-replied" }), "jean@client.fr")).toBe(true);
    expect(isBulkMail(headers({ "auto-submitted": "no" }), "jean@client.fr")).toBe(false);
  });
  it("laisse passer un mail humain", () => {
    expect(isBulkMail(headers({}), "jean@client.fr")).toBe(false);
    // Petites entreprises clientes : adresses génériques mais humaines.
    expect(isBulkMail(headers({}), "info@boulangerie-martin.fr")).toBe(false);
    expect(isBulkMail(headers({}), "hello@studio.fr")).toBe(false);
  });
});

describe("buildSnippet", () => {
  it("retire citations et signature", () => {
    const text = "Bonjour Ryan,\n\nPeux-tu regarder le bug ?\n\n-- \nJean\n> ancien message";
    expect(buildSnippet(text)).toBe("Bonjour Ryan, Peux-tu regarder le bug ?");
  });
  it("coupe au début de la citation", () => {
    expect(buildSnippet("Ok pour moi.\nLe lun. 9 nov. 2026, Ryan a écrit :\n> Hello")).toBe("Ok pour moi.");
  });
  it("tronque proprement", () => {
    const s = buildSnippet("a ".repeat(500), 20)!;
    expect(s.length).toBeLessThanOrEqual(20);
    expect(s.endsWith("…")).toBe(true);
  });
  it("renvoie null sur texte vide", () => {
    expect(buildSnippet("   \n ")).toBeNull();
  });
});

describe("mailExternalId", () => {
  it("préfère le Message-ID", () => {
    expect(mailExternalId("cstlab", "INBOX", 1, 42, "<abc@x>")).toBe("msgid:<abc@x>");
    expect(mailExternalId("cstlab", "INBOX", 1, 42)).toBe("imap:cstlab:INBOX:1:42");
  });
});
