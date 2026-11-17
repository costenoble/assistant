"use client";

import { useOptimistic, useState, useTransition } from "react";
import { BOARD_STATUSES, statusLabel, type TicketStatus } from "@/lib/db/types";
import type { TaskCard } from "@/lib/workspaces/queries";
import { TaskCardView, type Viewer } from "./task-card";

type Move = { id: string; status: TicketStatus; position: number };

/**
 * Tableau Kanban. L'admin déplace les cartes à la souris (glisser-déposer) ;
 * au clavier ou sur mobile, le statut se change depuis la page de la tâche.
 * `onMove` : action serveur (absente = tableau en lecture seule, côté client).
 */
export function Board({
  tasks,
  viewer,
  basePath,
  onMove,
}: {
  tasks: TaskCard[];
  viewer: Viewer;
  basePath: string;
  onMove?: (id: string, status: TicketStatus, position: number) => Promise<void>;
}) {
  const [optimistic, applyMove] = useOptimistic(tasks, (state, m: Move) =>
    state.map((t) => (t.id === m.id ? { ...t, status: m.status, position: m.position } : t)),
  );
  const [, start] = useTransition();
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<{ status: TicketStatus; index: number } | null>(null);

  const column = (status: TicketStatus) =>
    optimistic.filter((t) => t.status === status).sort((a, b) => a.position - b.position);

  function drop(status: TicketStatus, index: number) {
    const id = dragging;
    setDragging(null);
    setOver(null);
    if (!id || !onMove) return;
    const cards = column(status).filter((t) => t.id !== id);
    const before = cards[index - 1]?.position;
    const after = cards[index]?.position;
    const position =
      before !== undefined && after !== undefined ? (before + after) / 2 : before !== undefined ? before + 1 : after !== undefined ? after - 1 : 1;
    start(async () => {
      applyMove({ id, status, position });
      await onMove(id, status, position);
    });
  }

  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-2 md:-mx-0 md:px-0">
      <div className="grid min-w-[880px] grid-cols-5 gap-2.5">
        {BOARD_STATUSES.map((status) => {
          const cards = column(status);
          return (
            <section
              key={status}
              aria-label={statusLabel("task", status, viewer)}
              className={`flex min-h-48 flex-col rounded-xl border bg-surface-2/40 p-2 transition ${
                over?.status === status ? "border-accent/60 bg-accent/5" : "border-border"
              }`}
              onDragOver={(e) => {
                if (!onMove) return;
                e.preventDefault();
                if (over?.status !== status) setOver({ status, index: cards.length });
              }}
              onDrop={(e) => {
                e.preventDefault();
                drop(status, over?.status === status ? over.index : cards.length);
              }}
            >
              <h3 className="flex items-center justify-between px-1.5 pb-2 pt-1 text-xs font-semibold text-muted">
                <span>{statusLabel("task", status, viewer)}</span>
                <span className="tabular-nums">{cards.length}</span>
              </h3>
              <ol className="flex flex-1 flex-col gap-2">
                {cards.map((t, i) => (
                  <li
                    key={t.id}
                    draggable={!!onMove}
                    onDragStart={(e) => {
                      e.dataTransfer.effectAllowed = "move";
                      setDragging(t.id);
                    }}
                    onDragEnd={() => {
                      setDragging(null);
                      setOver(null);
                    }}
                    onDragOver={(e) => {
                      if (!onMove) return;
                      e.preventDefault();
                      e.stopPropagation();
                      const rect = e.currentTarget.getBoundingClientRect();
                      const index = e.clientY < rect.top + rect.height / 2 ? i : i + 1;
                      if (over?.status !== status || over.index !== index) setOver({ status, index });
                    }}
                    className={`relative ${dragging === t.id ? "opacity-40" : ""} ${onMove ? "cursor-grab active:cursor-grabbing" : ""}`}
                  >
                    {over?.status === status && over.index === i && dragging && dragging !== t.id && (
                      <span aria-hidden className="absolute -top-1.5 left-0 right-0 h-0.5 rounded bg-accent" />
                    )}
                    <TaskCardView task={t} href={`${basePath}/${t.id}`} viewer={viewer} />
                  </li>
                ))}
                {over?.status === status && over.index === cards.length && dragging && (
                  <li aria-hidden className="h-0.5 rounded bg-accent" />
                )}
              </ol>
            </section>
          );
        })}
      </div>
    </div>
  );
}
