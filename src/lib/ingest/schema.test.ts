import { describe, expect, it } from "vitest";
import { ingestBodySchema, normalizePriority, normalizeStatus } from "./schema";
import { extractBearer, generateApiKey, hashApiKey } from "./keys";

describe("ingestBodySchema", () => {
  it("accepte un payload minimal et applique les défauts", () => {
    const r = ingestBodySchema.parse({ items: [{ external_id: "audit-42", title: "Audit SEO à relire" }] });
    expect(r.items[0]!.kind).toBe("task");
  });
  it("refuse les mails (réservés à la synchro IMAP) et les dates sans fuseau", () => {
    expect(ingestBodySchema.safeParse({ items: [{ external_id: "x", title: "t", kind: "email" }] }).success).toBe(false);
    expect(ingestBodySchema.safeParse({ items: [{ external_id: "x", title: "t", due_at: "2026-11-10T10:00:00" }] }).success).toBe(false);
    expect(ingestBodySchema.safeParse({ items: [{ external_id: "x", title: "t", due_at: "2026-11-10T10:00:00+01:00" }] }).success).toBe(true);
  });
  it("limite la taille des lots", () => {
    const items = Array.from({ length: 101 }, (_, i) => ({ external_id: String(i), title: "t" }));
    expect(ingestBodySchema.safeParse({ items }).success).toBe(false);
  });
});

describe("normalisation", () => {
  it("convertit priorités et statuts", () => {
    expect(normalizePriority("urgent")).toBe(1);
    expect(normalizePriority(3)).toBe(3);
    expect(normalizePriority(undefined)).toBeNull();
    expect(normalizeStatus("cancelled")).toBe("archived");
    expect(normalizeStatus(undefined)).toBeUndefined();
  });
});

describe("clés d'API", () => {
  it("génère une clé dont seul le hash est conservé", () => {
    const { key, hash, hint } = generateApiKey("vigie-seo");
    expect(key.startsWith("ck_vigie-seo_")).toBe(true);
    expect(hashApiKey(key)).toBe(hash);
    expect(key.endsWith(hint)).toBe(true);
  });
  it("lit l'en-tête Authorization", () => {
    expect(extractBearer("Bearer abc")).toBe("abc");
    expect(extractBearer("Basic abc")).toBeNull();
    expect(extractBearer(null)).toBeNull();
  });
});
