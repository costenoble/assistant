import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { items } from "@/lib/db/schema";
import { createTestDb } from "@/test/db";
import { closePastEvents, ensureSource, recomputePriorities, upsertItems } from "./repo";

let db: Db;
const saas = { slug: "kompta", name: "Kompta", kind: "saas", default_context: "freelance" } as const;
const one = async (id: string) => (await db.select().from(items).where(eq(items.id, id)))[0]!;

beforeEach(async () => {
  db = await createTestDb();
});

describe("ensureSource", () => {
  it("crée la source une seule fois", async () => {
    const a = await ensureSource(db, saas);
    const b = await ensureSource(db, { ...saas, name: "Kompta.pro" });
    expect(b.id).toBe(a.id);
    expect(b.name).toBe("Kompta.pro");
  });
});

describe("upsertItems", () => {
  it("est idempotent par external_id", async () => {
    const source = await ensureSource(db, saas);
    const first = await upsertItems(db, source, [{ external_id: "inv-1", kind: "task", title: "Relancer" }]);
    const second = await upsertItems(db, source, [{ external_id: "inv-1", kind: "task", title: "Relancer X" }]);
    expect(second.get("inv-1")).toBe(first.get("inv-1"));
    expect(await db.$count(items)).toBe(1);
    expect((await one(first.get("inv-1")!)).title).toBe("Relancer X");
  });

  it("garde les champs absents d'une mise à jour partielle, efface ceux à null", async () => {
    const source = await ensureSource(db, saas);
    const ids = await upsertItems(db, source, [
      { external_id: "inv-1", kind: "task", title: "Relancer", url: "https://k.pro/1", body: "détail", due_at: "2026-11-12T18:00:00+01:00", source_priority: 2, metadata: { amount: 10 } },
    ]);
    await upsertItems(db, source, [{ external_id: "inv-1", kind: "task", title: "Relancer", status: "done", body: null }]);
    const row = await one(ids.get("inv-1")!);
    expect(row.status).toBe("done");
    expect(row.completed_at).toBeInstanceOf(Date); // posé par le trigger
    expect(row.url).toBe("https://k.pro/1");
    expect(row.due_at?.toISOString()).toBe("2026-11-12T17:00:00.000Z");
    expect(row.source_priority).toBe(2);
    expect(row.metadata).toEqual({ amount: 10 });
    expect(row.body).toBeNull();
  });

  it("ne réécrit pas le statut choisi par l'utilisateur", async () => {
    const source = await ensureSource(db, saas);
    const ids = await upsertItems(db, source, [{ external_id: "a", kind: "task", title: "T", initial_status: "todo" }]);
    const id = ids.get("a")!;
    await db.update(items).set({ status: "waiting", manual_priority: "high" }).where(eq(items.id, id));
    await upsertItems(db, source, [{ external_id: "a", kind: "task", title: "T modifié", initial_status: "todo" }]);
    const row = await one(id);
    expect(row.status).toBe("waiting");
    expect(row.manual_priority).toBe("high");
    expect(row.title).toBe("T modifié");
  });

  it("n'écrit rien quand rien n'a changé", async () => {
    const source = await ensureSource(db, saas);
    const item = { external_id: "a", kind: "event", title: "Réunion", starts_at: "2026-11-12T09:00:00Z", metadata: { online: true } } as const;
    const ids = await upsertItems(db, source, [item]);
    const before = await one(ids.get("a")!);
    await upsertItems(db, source, [item]);
    expect((await one(ids.get("a")!)).updated_at.getTime()).toBe(before.updated_at.getTime());
  });

  it("sépare les sources : même external_id, deux items", async () => {
    const a = await ensureSource(db, saas);
    const b = await ensureSource(db, { ...saas, slug: "vigie" });
    await upsertItems(db, a, [{ external_id: "1", kind: "task", title: "A" }]);
    await upsertItems(db, b, [{ external_id: "1", kind: "task", title: "B" }]);
    expect(await db.$count(items)).toBe(2);
  });
});

describe("priorités et clôture", () => {
  const NOW = new Date("2026-11-10T09:00:00Z");

  it("recalcule les items ouverts et n'écrit que les changements", async () => {
    await db.insert(items).values([
      { title: "En retard", kind: "task", status: "todo", due_at: new Date("2026-11-08T09:00:00Z") },
      { title: "Fini", kind: "task", status: "done", due_at: new Date("2026-11-08T09:00:00Z") },
    ]);
    expect(await recomputePriorities(db, NOW)).toEqual({ scanned: 1, updated: 1 });
    expect(await recomputePriorities(db, NOW)).toEqual({ scanned: 1, updated: 0 });
    const [late] = await db.select().from(items).where(eq(items.title, "En retard"));
    expect(late!.priority_level).toBe("high");
    expect(late!.priority_reasons).toContain("En retard de 2 j");
  });

  it("archive les RDV terminés depuis plus de 24 h, pas ceux de la veille au soir", async () => {
    await db.insert(items).values([
      { title: "Vieux", kind: "event", status: "todo", ends_at: new Date("2026-11-08T10:00:00Z") },
      { title: "Hier soir", kind: "event", status: "todo", ends_at: new Date("2026-11-09T18:00:00Z") },
      { title: "Tâche ancienne", kind: "task", status: "todo", ends_at: new Date("2026-11-01T10:00:00Z") },
    ]);
    expect(await closePastEvents(db, NOW)).toBe(1);
    const [old] = await db.select().from(items).where(eq(items.title, "Vieux"));
    expect(old!.status).toBe("archived");
  });
});
