import { describe, expect, it } from "vitest";
import { parseQuickAdd } from "./parse";
import { fromParis, parisDayBounds } from "@/lib/time/paris";

// Lundi 9 novembre 2026, 10:00 à Paris (UTC+1)
const NOW = new Date("2026-11-09T09:00:00Z");

describe("parseQuickAdd", () => {
  it("extrait titre, date, heure, contexte et priorité", () => {
    const r = parseQuickAdd("Rappeler Jean demain 14h #semaphors !!", NOW);
    expect(r.title).toBe("Rappeler Jean");
    expect(r.context).toBe("semaphors");
    expect(r.manualPriority).toBe("high");
    expect(r.dueAt?.toISOString()).toBe("2026-11-10T13:00:00.000Z");
  });

  it("repère le client après @, sans confondre avec une adresse mail", () => {
    const r = parseQuickAdd("Envoyer la maquette @Cabinet-Leroy vendredi !!", NOW);
    expect(r.clientRef).toBe("cabinet-leroy");
    expect(r.title).toBe("Envoyer la maquette");
    const mail = parseQuickAdd("Écrire à paul@client.fr demain", NOW);
    expect(mail.clientRef).toBeUndefined();
    expect(mail.title).toBe("Écrire à paul@client.fr");
  });

  it("jour de semaine = la prochaine occurrence", () => {
    expect(parseQuickAdd("Facturer client vendredi", NOW).dueAt?.toISOString()).toBe("2026-11-13T17:00:00.000Z");
    expect(parseQuickAdd("Point hebdo lundi 9h30", NOW).dueAt?.toISOString()).toBe("2026-11-16T08:30:00.000Z");
  });

  it("date explicite jj/mm, l'année suivante si passée", () => {
    expect(parseQuickAdd("Renouveler domaine le 05/01", NOW).dueAt?.toISOString()).toBe("2027-01-05T17:00:00.000Z");
  });

  it("heure seule déjà passée → demain", () => {
    expect(parseQuickAdd("Appeler le comptable 8h", NOW).dueAt?.toISOString()).toBe("2026-11-10T07:00:00.000Z");
  });

  it("texte simple sans marqueur", () => {
    expect(parseQuickAdd("Acheter du café", NOW)).toEqual({ title: "Acheter du café" });
  });

  it("alias #sema et urgence !!!", () => {
    const r = parseQuickAdd("Serveur en panne !!! #sema", NOW);
    expect(r.context).toBe("semaphors");
    expect(r.manualPriority).toBe("critical");
  });
});

describe("heure de Paris", () => {
  it("gère l'heure d'été", () => {
    expect(fromParis(2026, 7, 1, 9, 0).toISOString()).toBe("2026-07-01T07:00:00.000Z");
    expect(fromParis(2026, 12, 1, 9, 0).toISOString()).toBe("2026-12-01T08:00:00.000Z");
  });
  it("bornes de la journée", () => {
    const { start, end } = parisDayBounds(NOW);
    expect(start.toISOString()).toBe("2026-11-08T23:00:00.000Z");
    expect(end.toISOString()).toBe("2026-11-09T23:00:00.000Z");
  });
});
