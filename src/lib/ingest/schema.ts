import { z } from "zod";
import { ITEM_CONTEXTS, type ItemStatus } from "@/lib/db/types";

/**
 * Contrat de l'API d'ingestion — c'est ce que chaque SaaS (Vigie SEO,
 * Kompta.pro, app DPP…) envoie à Cockpit. Volontairement simple et stable.
 */
const PRIORITY_MAP = { urgent: 1, high: 2, normal: 3, low: 4 } as const;
const STATUS_MAP: Record<"open" | "waiting" | "done" | "cancelled", ItemStatus> = {
  open: "todo",
  waiting: "waiting",
  done: "done",
  cancelled: "archived",
};

const isoDate = z.iso.datetime({ offset: true });

export const ingestItemSchema = z.object({
  external_id: z.string().min(1).max(200),
  kind: z.enum(["task", "followup", "event"]).default("task"),
  title: z.string().min(1).max(500),
  body: z.string().max(10_000).nullish(),
  url: z.url().nullish(),
  priority: z.union([z.enum(["urgent", "high", "normal", "low"]), z.number().int().min(1).max(4)]).nullish(),
  due_at: isoDate.nullish(),
  starts_at: isoDate.nullish(),
  ends_at: isoDate.nullish(),
  context: z.enum(ITEM_CONTEXTS).optional(),
  status: z.enum(["open", "waiting", "done", "cancelled"]).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const ingestBodySchema = z.object({
  items: z.array(ingestItemSchema).min(1).max(100),
});

export type IngestItem = z.infer<typeof ingestItemSchema>;

export function normalizePriority(p: IngestItem["priority"]): number | null {
  if (p == null) return null;
  return typeof p === "number" ? p : PRIORITY_MAP[p];
}

export function normalizeStatus(s: IngestItem["status"]): ItemStatus | undefined {
  return s ? STATUS_MAP[s] : undefined;
}
