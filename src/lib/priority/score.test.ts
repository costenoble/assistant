import { describe, expect, it } from "vitest";
import { computePriority, levelFromScore, matchMailRules } from "./score";

const NOW = new Date("2026-11-09T09:00:00+01:00");
const h = (n: number) => new Date(NOW.getTime() + n * 3_600_000).toISOString();

describe("levelFromScore", () => {
  it("découpe les niveaux aux bons seuils", () => {
    expect(levelFromScore(70)).toBe("critical");
    expect(levelFromScore(69)).toBe("high");
    expect(levelFromScore(45)).toBe("high");
    expect(levelFromScore(20)).toBe("normal");
    expect(levelFromScore(19)).toBe("low");
  });
});

describe("computePriority", () => {
  const base = { kind: "task", status: "todo", context: "freelance", title: "Livrer la maquette" } as const;

  it("l'override manuel prime sur tout", () => {
    const r = computePriority({ ...base, manualPriority: "low", dueAt: h(-48) }, { now: NOW });
    expect(r.level).toBe("low");
    expect(r.reasons).toEqual(["Priorité fixée manuellement"]);
  });

  it("une tâche en retard devient urgente", () => {
    const r = computePriority({ ...base, dueAt: h(-26) }, { now: NOW });
    expect(r.level).toBe("high");
    expect(r.reasons).toContain("En retard de 1 j");
    const urgent = computePriority({ ...base, dueAt: h(-26), sourcePriority: 2 }, { now: NOW });
    expect(urgent.level).toBe("critical");
  });

  it("l'échéance proche pèse plus que l'échéance lointaine", () => {
    const soon = computePriority({ ...base, dueAt: h(5) }, { now: NOW });
    const later = computePriority({ ...base, dueAt: h(24 * 6) }, { now: NOW });
    expect(soon.score).toBeGreaterThan(later.score);
  });

  it("les éléments clos tombent à 0", () => {
    expect(computePriority({ ...base, status: "done", dueAt: h(-5) }, { now: NOW }).score).toBe(0);
  });

  it("un RDV imminent est critique, un RDV passé disparaît", () => {
    const soon = computePriority({ kind: "event", status: "todo", context: "semaphors", title: "Point équipe", startsAt: h(1) }, { now: NOW });
    expect(soon.level).toBe("high");
    expect(soon.reasons).toContain("RDV dans 1 h");
    const past = computePriority({ kind: "event", status: "todo", context: "semaphors", title: "Point équipe", startsAt: h(-5) }, { now: NOW });
    expect(past.score).toBe(0);
  });

  it("détecte les mots-clés d'urgence une seule fois", () => {
    const r = computePriority({ ...base, title: "URGENT relance facture impayée" }, { now: NOW });
    expect(r.reasons.filter((x) => x.startsWith("Mot-clé"))).toHaveLength(1);
  });

  it("un mail client sans réponse depuis 4 jours remonte, une newsletter descend", () => {
    const client = computePriority(
      { kind: "email", status: "inbox", context: "freelance", title: "Question sur le devis", email: { fromAddress: "a@client.fr", isAnswered: false, isBulk: false, receivedAt: h(-96) } },
      { now: NOW },
    );
    expect(client.level).toBe("normal");
    expect(client.reasons).toContain("Sans réponse depuis 4 j");

    const news = computePriority(
      { kind: "email", status: "inbox", context: "perso", title: "Les nouveautés de novembre", email: { isBulk: true, receivedAt: h(-1) } },
      { now: NOW },
    );
    expect(news.level).toBe("low");
  });

  it("applique les règles VIP et ignore", () => {
    const rules = [
      { match_type: "from_domain", pattern: "semaphors.fr", context: "semaphors", priority_boost: 0, action: "vip" },
      { match_type: "from_address", pattern: "spam@pub.com", context: null, priority_boost: 0, action: "ignore" },
    ] as const;
    const vip = computePriority(
      { kind: "email", status: "inbox", context: "semaphors", title: "Dispo cet aprèm ?", email: { fromAddress: "boss@semaphors.fr", receivedAt: h(-30) } },
      { now: NOW, rules: [...rules] },
    );
    expect(vip.reasons).toContain("Expéditeur VIP (semaphors.fr)");
    expect(vip.level).toBe("high");

    const ignored = computePriority(
      { kind: "email", status: "inbox", context: "perso", title: "Promo urgente", email: { fromAddress: "spam@pub.com" } },
      { now: NOW, rules: [...rules] },
    );
    expect(ignored.score).toBe(0);
  });

  it("borne le score entre 0 et 100", () => {
    const r = computePriority(
      { ...base, sourcePriority: 1, dueAt: h(-100), title: "urgent", status: "inbox", createdAt: h(-200) },
      { now: NOW },
    );
    expect(r.score).toBe(100);
  });
});

describe("matchMailRules", () => {
  it("matche le domaine et ses sous-domaines", () => {
    const rules = [{ match_type: "from_domain", pattern: "@semaphors.fr", context: null, priority_boost: 0, action: "none" }] as const;
    expect(matchMailRules([...rules], "x@semaphors.fr", "")).toHaveLength(1);
    expect(matchMailRules([...rules], "x@mail.semaphors.fr", "")).toHaveLength(1);
    expect(matchMailRules([...rules], "x@notsemaphors.fr", "")).toHaveLength(0);
  });
});
