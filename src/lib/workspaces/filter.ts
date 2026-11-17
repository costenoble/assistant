import type { TaskCard } from "./queries";

/** Filtres du tableau, tels qu'ils sont dans l'URL. */
export interface TaskFilterParams {
  projet?: string;
  assigne?: string; // "moi", "personne" ou un id de contact
  priorite?: string;
  etiquette?: string;
}

export function filterTasks(tasks: TaskCard[], f: TaskFilterParams): TaskCard[] {
  return tasks.filter((t) => {
    if (f.projet && t.project_id !== f.projet) return false;
    if (f.priorite && t.priority !== f.priorite) return false;
    if (f.etiquette && !t.labels.includes(f.etiquette)) return false;
    if (f.assigne === "moi" && !(t.assigned_to_owner && !t.assignee_contact_id)) return false;
    if (f.assigne === "personne" && (t.assigned_to_owner || t.assignee_contact_id)) return false;
    if (f.assigne && f.assigne !== "moi" && f.assigne !== "personne" && t.assignee_contact_id !== f.assigne) return false;
    return true;
  });
}

/** Toutes les étiquettes utilisées, triées. */
export const allLabels = (tasks: TaskCard[]) => [...new Set(tasks.flatMap((t) => t.labels))].sort();
