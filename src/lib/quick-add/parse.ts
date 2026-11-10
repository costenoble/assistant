import type { ItemContext, PriorityLevel } from "@/lib/db/types";
import { fromParis, parisParts } from "@/lib/time/paris";

/**
 * Saisie rapide en langage naturel, pour noter une chose en 3 secondes :
 *   « Rappeler Jean demain 14h #semaphors !! »
 *   → titre « Rappeler Jean », échéance demain 14:00 (Paris), contexte Semaphors, priorité haute.
 *
 * Marqueurs : #perso #freelance #semaphors #saas · ! (normal) !! (haute) !!! (urgent)
 * Dates : aujourd'hui, ce soir, demain, après-demain, lundi…dimanche, 12/11, « 14h », « 14h30 », « 9:15 ».
 */
export interface QuickAddResult {
  title: string;
  context?: ItemContext;
  manualPriority?: PriorityLevel;
  dueAt?: Date;
}

const DAYS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
const CONTEXTS: ItemContext[] = ["perso", "freelance", "semaphors", "saas"];
const DEFAULT_HOUR = 18; // une tâche « pour demain » sans heure = avant la fin de journée

export function parseQuickAdd(input: string, now = new Date()): QuickAddResult {
  let text = ` ${input.trim()} `;
  const result: QuickAddResult = { title: "" };
  const take = (re: RegExp) => {
    const m = text.match(re);
    if (m) text = text.replace(m[0], " ");
    return m;
  };

  // Contexte
  const ctx = take(/\s#(perso|freelance|semaphors|sema|saas)\b/i);
  if (ctx) {
    const v = ctx[1]!.toLowerCase();
    result.context = v === "sema" ? "semaphors" : (CONTEXTS.find((c) => c === v) ?? undefined);
  }

  // Priorité
  const bang = take(/\s(!{1,3})(?=\s)/);
  if (bang) result.manualPriority = bang[1]!.length === 3 ? "critical" : bang[1]!.length === 2 ? "high" : "normal";

  // Heure
  let hour: number | undefined;
  let minute = 0;
  const time = take(/\s(?:à\s)?([01]?\d|2[0-3])(?:h|:)([0-5]\d)?(?=\s)/i);
  if (time) {
    hour = Number(time[1]);
    minute = time[2] ? Number(time[2]) : 0;
  }

  // Jour
  const p = parisParts(now);
  let offset: number | undefined;
  let explicit: { day: number; month: number } | undefined;
  const dayWord = take(/\s(aujourd'hui|aujourd’hui|ce soir|après-demain|apres-demain|demain|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)(?=\s)/i);
  if (dayWord) {
    const w = dayWord[1]!.toLowerCase();
    if (w.startsWith("aujourd")) offset = 0;
    else if (w === "ce soir") { offset = 0; hour ??= 19; }
    else if (w.startsWith("apr")) offset = 2;
    else if (w === "demain") offset = 1;
    else {
      const target = DAYS.indexOf(w);
      offset = ((target - p.weekday + 7) % 7) || 7; // « lundi » = le prochain lundi
    }
  } else {
    const date = take(/\s(?:le\s)?(\d{1,2})\/(\d{1,2})(?=\s)/);
    if (date) explicit = { day: Number(date[1]), month: Number(date[2]) };
  }

  if (explicit) {
    let year = p.year;
    if (explicit.month < p.month || (explicit.month === p.month && explicit.day < p.day)) year++;
    result.dueAt = fromParis(year, explicit.month, explicit.day, hour ?? DEFAULT_HOUR, minute);
  } else if (offset !== undefined) {
    result.dueAt = fromParis(p.year, p.month, p.day + offset, hour ?? DEFAULT_HOUR, minute);
  } else if (hour !== undefined) {
    // Heure seule : aujourd'hui, ou demain si l'heure est passée.
    let due = fromParis(p.year, p.month, p.day, hour, minute);
    if (due.getTime() <= now.getTime()) due = fromParis(p.year, p.month, p.day + 1, hour, minute);
    result.dueAt = due;
  }

  result.title = text.replace(/\s+/g, " ").trim() || input.trim();
  return result;
}
