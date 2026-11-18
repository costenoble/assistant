"use client";

import { useState, useTransition } from "react";
import {
  TASK_PRIORITIES,
  TASK_PRIORITY_LABELS,
  TICKET_STATUSES,
  statusLabel,
  type TaskPriority,
  type TicketStatus,
} from "@/lib/db/types";
import { PriorityIcon } from "@/components/workspace/bits";
import { updateTaskField } from "../../espaces/actions";

type Option = { id: string; name: string };

/** Panneau de propriétés d'une tâche : chaque champ s'enregistre dès qu'il change. */
export function TaskProperties({
  ticketId,
  status,
  priority,
  assignee,
  projectId,
  dueOn,
  labels,
  contacts,
  projects,
  milestoneId = null,
  milestones = [],
}: {
  ticketId: string;
  status: TicketStatus;
  priority: TaskPriority;
  assignee: string; // "owner", un id de contact, ou ""
  projectId: string | null;
  dueOn: string | null;
  labels: string[];
  contacts: Option[];
  projects: Option[];
  milestoneId?: string | null;
  milestones?: Option[];
}) {
  const [pending, start] = useTransition();
  const save = (field: string, value: string) => start(() => updateTaskField(ticketId, field, value));
  const [labelsDraft, setLabelsDraft] = useState(labels.join(", "));

  return (
    <dl className={`space-y-3 text-sm transition ${pending ? "opacity-60" : ""}`}>
      <Row label="Statut">
        <select aria-label="Statut" className="input h-8 w-full py-0" defaultValue={status} onChange={(e) => save("status", e.target.value)}>
          {TICKET_STATUSES.map((s) => <option key={s} value={s}>{statusLabel("task", s, "admin")}</option>)}
        </select>
      </Row>
      <Row label="Priorité">
        <div className="flex items-center gap-2">
          <PriorityIcon priority={priority} />
          <select aria-label="Priorité" className="input h-8 w-full py-0" defaultValue={priority} onChange={(e) => save("priority", e.target.value)}>
            {TASK_PRIORITIES.map((p) => <option key={p} value={p}>{TASK_PRIORITY_LABELS[p]}</option>)}
          </select>
        </div>
      </Row>
      <Row label="Assignée à">
        <select aria-label="Assignée à" className="input h-8 w-full py-0" defaultValue={assignee} onChange={(e) => save("assignee", e.target.value)}>
          <option value="owner">Moi</option>
          <option value="">Personne</option>
          {contacts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </Row>
      <Row label="Projet">
        <select aria-label="Projet" className="input h-8 w-full py-0" defaultValue={projectId ?? ""} onChange={(e) => save("project", e.target.value)}>
          <option value="">Aucun</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </Row>
      {milestones.length > 0 && (
        <Row label="Jalon">
          <select aria-label="Jalon" className="input h-8 w-full py-0" defaultValue={milestoneId ?? ""} onChange={(e) => save("milestone", e.target.value)}>
            <option value="">Aucun</option>
            {milestones.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </Row>
      )}
      <Row label="Échéance">
        <input aria-label="Échéance" type="date" className="input h-8 w-full py-0" defaultValue={dueOn ?? ""} onChange={(e) => save("due_on", e.target.value)} />
      </Row>
      <Row label="Étiquettes">
        <input
          aria-label="Étiquettes, séparées par des virgules"
          className="input h-8 w-full py-0"
          value={labelsDraft}
          placeholder="bug, ux"
          onChange={(e) => setLabelsDraft(e.target.value)}
          onBlur={() => labelsDraft !== labels.join(", ") && save("labels", labelsDraft)}
        />
      </Row>
    </dl>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <dt className="text-xs text-muted">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/** Titre et description modifiables. */
export function TaskTextEditor({ ticketId, subject, description }: { ticketId: string; subject: string; description: string | null }) {
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();
  if (!editing) {
    return (
      <div className="group space-y-2">
        {description ? (
          <p className="whitespace-pre-line text-[15px] leading-7">{description}</p>
        ) : (
          <p className="text-sm text-muted">Pas de description.</p>
        )}
        <button className="btn-ghost -ml-2" onClick={() => setEditing(true)}>Modifier le titre et la description</button>
      </div>
    );
  }
  return (
    <form
      className="space-y-2"
      action={(fd) =>
        start(async () => {
          const s = String(fd.get("subject") ?? "");
          const d = String(fd.get("description") ?? "");
          if (s !== subject) await updateTaskField(ticketId, "subject", s);
          if (d !== (description ?? "")) await updateTaskField(ticketId, "description", d);
          setEditing(false);
        })
      }
    >
      <label className="sr-only" htmlFor="edit-subject">Titre</label>
      <input id="edit-subject" name="subject" defaultValue={subject} required minLength={2} maxLength={200} className="input w-full" />
      <label className="sr-only" htmlFor="edit-desc">Description</label>
      <textarea id="edit-desc" name="description" defaultValue={description ?? ""} rows={6} className="input w-full resize-y" />
      <div className="flex gap-2">
        <button className="btn-primary" disabled={pending}>Enregistrer</button>
        <button type="button" className="btn" onClick={() => setEditing(false)}>Annuler</button>
      </div>
    </form>
  );
}
