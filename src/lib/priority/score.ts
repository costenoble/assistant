import type { ItemContext, ItemKind, ItemStatus, MailRule, PriorityLevel } from "@/lib/db/types";

/**
 * Moteur de priorité — fonction pure, déterministe, testée.
 *
 * Score de 0 à 100 → niveau (critical / high / normal / low).
 * Chaque point ajouté laisse une raison lisible, affichée dans l'UI pour
 * comprendre POURQUOI un élément remonte (« En retard de 2 j », « Client VIP »…).
 *
 * Le score dépend du temps (échéances qui approchent), il est donc
 * recalculé à chaque synchro pour tous les items ouverts.
 */

export interface PriorityInput {
  kind: ItemKind;
  status: ItemStatus;
  context: ItemContext;
  title: string;
  body?: string | null;
  sourcePriority?: number | null; // 1 urgent … 4 bas (fourni par un SaaS)
  manualPriority?: PriorityLevel | null;
  dueAt?: string | Date | null;
  startsAt?: string | Date | null;
  createdAt?: string | Date | null;
  email?: {
    fromAddress?: string | null;
    isAnswered?: boolean;
    isBulk?: boolean;
    receivedAt?: string | Date | null;
  } | null;
}

export interface PriorityResult {
  score: number;
  level: PriorityLevel;
  reasons: string[];
}

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export const URGENT_KEYWORDS = [
  "urgent",
  "asap",
  "au plus vite",
  "dès que possible",
  "relance",
  "rappel",
  "impayé",
  "impayée",
  "mise en demeure",
  "échéance",
  "deadline",
  "bloquant",
  "en panne",
  "ne fonctionne plus",
  "production",
  "incident",
] as const;

const SOURCE_PRIORITY_POINTS: Record<number, [number, string]> = {
  1: [40, "Marqué urgent par la source"],
  2: [25, "Marqué important par la source"],
  3: [10, "Priorité normale (source)"],
  4: [0, "Priorité basse (source)"],
};

export const LEVEL_FOR_MANUAL: Record<PriorityLevel, number> = {
  critical: 90,
  high: 60,
  normal: 30,
  low: 5,
};

export function levelFromScore(score: number): PriorityLevel {
  if (score >= 70) return "critical";
  if (score >= 45) return "high";
  if (score >= 20) return "normal";
  return "low";
}

function toTime(value: string | Date | null | undefined): number | null {
  if (value == null) return null;
  const t = typeof value === "string" ? Date.parse(value) : value.getTime();
  return Number.isNaN(t) ? null : t;
}

function formatDelay(ms: number): string {
  const abs = Math.abs(ms);
  if (abs < HOUR) return `${Math.max(1, Math.round(abs / 60_000))} min`;
  if (abs < DAY) return `${Math.round(abs / HOUR)} h`;
  return `${Math.round(abs / DAY)} j`;
}

export function domainOf(address: string | null | undefined): string | null {
  if (!address) return null;
  const at = address.lastIndexOf("@");
  return at === -1 ? null : address.slice(at + 1).toLowerCase();
}

/** Règles de tri applicables à un mail, dans l'ordre de déclaration. */
export function matchMailRules(
  rules: Pick<MailRule, "match_type" | "pattern" | "context" | "priority_boost" | "action">[],
  fromAddress: string | null | undefined,
  subject: string | null | undefined,
) {
  const from = fromAddress?.toLowerCase() ?? "";
  const domain = domainOf(from);
  const subj = subject?.toLowerCase() ?? "";
  return rules.filter((r) => {
    const p = r.pattern.toLowerCase().trim();
    if (!p) return false;
    switch (r.match_type) {
      case "from_address":
        return from === p;
      case "from_domain":
        return domain === p.replace(/^@/, "") || (domain?.endsWith(`.${p.replace(/^@/, "")}`) ?? false);
      case "subject_contains":
        return subj.includes(p);
    }
  });
}

export function computePriority(
  input: PriorityInput,
  opts: { now?: Date; rules?: Parameters<typeof matchMailRules>[0] } = {},
): PriorityResult {
  const now = (opts.now ?? new Date()).getTime();
  const reasons: string[] = [];

  // 1. L'override manuel gagne toujours.
  if (input.manualPriority) {
    return {
      score: LEVEL_FOR_MANUAL[input.manualPriority],
      level: input.manualPriority,
      reasons: ["Priorité fixée manuellement"],
    };
  }

  // 2. Éléments clos : plus de priorité.
  if (input.status === "done" || input.status === "archived") {
    return { score: 0, level: "low", reasons: [] };
  }

  let score = 0;
  const add = (points: number, reason: string) => {
    if (points === 0) return;
    score += points;
    reasons.push(reason);
  };

  // 3. Priorité donnée par la source (SaaS).
  if (input.sourcePriority != null) {
    const entry = SOURCE_PRIORITY_POINTS[input.sourcePriority];
    if (entry) add(entry[0], entry[1]);
  } else if (input.kind === "task") {
    add(10, "Tâche à faire");
  }

  // 4. Échéance.
  const due = toTime(input.dueAt);
  if (due != null) {
    const delta = due - now;
    if (delta < 0) add(45, `En retard de ${formatDelay(delta)}`);
    else if (delta <= DAY) add(35, `Échéance dans ${formatDelay(delta)}`);
    else if (delta <= 3 * DAY) add(20, `Échéance dans ${formatDelay(delta)}`);
    else if (delta <= 7 * DAY) add(10, `Échéance dans ${formatDelay(delta)}`);
  }

  // 5. Événement qui approche (RDV).
  const starts = toTime(input.startsAt);
  if (input.kind === "event" && starts != null) {
    const delta = starts - now;
    if (delta >= -HOUR && delta <= 2 * HOUR) add(50, delta <= 0 ? "RDV en cours" : `RDV dans ${formatDelay(delta)}`);
    else if (delta > 0 && delta <= DAY) add(25, `RDV dans ${formatDelay(delta)}`);
    else if (delta < -HOUR) add(-100, "RDV passé");
  }

  // 6. Mots-clés d'urgence (une seule fois).
  const haystack = `${input.title} ${input.body ?? ""}`.toLowerCase();
  const keyword = URGENT_KEYWORDS.find((k) => haystack.includes(k));
  if (keyword) add(15, `Mot-clé « ${keyword} »`);

  // 7. Spécificités mail.
  if (input.kind === "email" && input.email) {
    const e = input.email;
    if (e.isBulk) {
      add(-30, "Newsletter / notification automatique");
    } else if (!e.isAnswered) {
      add(15, "Mail sans réponse");
      const received = toTime(e.receivedAt);
      if (received != null) {
        const age = now - received;
        if (age > 3 * DAY) add(20, `Sans réponse depuis ${formatDelay(age)}`);
        else if (age > DAY) add(10, `Sans réponse depuis ${formatDelay(age)}`);
      }
    }

    for (const rule of matchMailRules(opts.rules ?? [], e.fromAddress, input.title)) {
      if (rule.action === "ignore") {
        return { score: 0, level: "low", reasons: [`Ignoré par la règle « ${rule.pattern} »`] };
      }
      if (rule.action === "vip") add(25, `Expéditeur VIP (${rule.pattern})`);
      if (rule.priority_boost) add(rule.priority_boost, `Règle « ${rule.pattern} »`);
    }
  }

  // 8. Statut « en attente » : on attend quelqu'un d'autre.
  if (input.status === "waiting") add(-20, "En attente d'un tiers");

  // 9. Tâche qui traîne dans l'inbox sans être triée.
  const created = toTime(input.createdAt);
  if (input.status === "inbox" && input.kind !== "event" && created != null && now - created > 2 * DAY) {
    add(10, "Pas encore trié");
  }

  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  return { score: clamped, level: levelFromScore(clamped), reasons };
}
