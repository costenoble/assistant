"use client";

import { useEffect, useOptimistic, useRef, useState, useTransition } from "react";
import { BOARD_STATUSES, statusLabel, type TicketStatus } from "@/lib/db/types";
import type { TaskCard } from "@/lib/workspaces/queries";
import { TaskCardView, type Viewer } from "./task-card";

type Move = { id: string; status: TicketStatus; position: number };
type Over = { status: TicketStatus; index: number } | null;

const LONG_PRESS_MS = 350;
const EDGE = 48; // px depuis le bord du tableau où il défile tout seul pendant un glisser au doigt

/**
 * Tableau Kanban. Trois façons de déplacer une carte (admin seulement) :
 * - souris : glisser-déposer ;
 * - doigt : appui long sur la carte, puis glisser (le tableau défile près des bords) ;
 * - clavier : Alt + ← / → change de colonne, Alt + ↑ / ↓ change l'ordre.
 * `onMove` absent = tableau en lecture seule (portail client).
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
  const [over, setOver] = useState<Over>(null);
  const [ghost, setGhost] = useState<{ x: number; y: number; title: string } | null>(null);
  const [announce, setAnnounce] = useState("");
  const scroller = useRef<HTMLDivElement>(null);
  const press = useRef<{ timer: ReturnType<typeof setTimeout>; x: number; y: number; id: string } | null>(null);
  const justDragged = useRef(false);
  const overRef = useRef<Over>(null);
  overRef.current = over;

  const column = (status: TicketStatus) => optimistic.filter((t) => t.status === status).sort((a, b) => a.position - b.position);
  const label = (s: TicketStatus) => statusLabel("task", s, viewer);

  /** Position entre les voisines à l'emplacement `index` de la colonne (la carte déplacée exclue). */
  function positionAt(id: string, status: TicketStatus, index: number) {
    const cards = column(status).filter((t) => t.id !== id);
    const before = cards[index - 1]?.position;
    const after = cards[index]?.position;
    if (before !== undefined && after !== undefined) return (before + after) / 2;
    if (before !== undefined) return before + 1;
    if (after !== undefined) return after - 1;
    return 1;
  }

  function move(id: string, status: TicketStatus, index: number, focus = false) {
    if (!onMove) return;
    const position = positionAt(id, status, index);
    const card = optimistic.find((t) => t.id === id);
    start(async () => {
      applyMove({ id, status, position });
      await onMove(id, status, position);
    });
    if (card) setAnnounce(`« ${card.subject} » déplacée dans ${label(status)}, position ${index + 1}.`);
    if (focus) requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-card="${id}"] a`)?.focus());
  }

  function endDrag() {
    setDragging(null);
    setOver(null);
    setGhost(null);
  }

  function drop(status: TicketStatus, index: number) {
    const id = dragging;
    endDrag();
    if (id) move(id, status, index);
  }

  // ─── Doigt ────────────────────────────────────────────────────────
  /** Colonne et emplacement sous le doigt. */
  function targetAt(x: number, y: number): Over {
    const section = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-status]");
    if (!section) return null;
    const status = section.dataset.status as TicketStatus;
    const cards = [...section.querySelectorAll<HTMLElement>("[data-card]")].filter((el) => el.dataset.card !== dragging);
    const index = cards.findIndex((el) => {
      const r = el.getBoundingClientRect();
      return y < r.top + r.height / 2;
    });
    return { status, index: index === -1 ? cards.length : index };
  }

  useEffect(() => {
    if (!dragging || !press.current) return;
    // Pendant le glisser au doigt : on bloque le défilement de la page (écouteur non passif) et on suit le doigt.
    let frame = 0;
    let lastX = 0;
    const autoscroll = () => {
      const el = scroller.current;
      if (el) {
        const r = el.getBoundingClientRect();
        if (lastX < r.left + EDGE) el.scrollLeft -= 12;
        else if (lastX > r.right - EDGE) el.scrollLeft += 12;
      }
      frame = requestAnimationFrame(autoscroll);
    };
    const onMoveTouch = (e: TouchEvent) => {
      e.preventDefault();
      const t = e.touches[0];
      if (!t) return;
      lastX = t.clientX;
      setGhost((g) => (g ? { ...g, x: t.clientX, y: t.clientY } : g));
      setOver(targetAt(t.clientX, t.clientY));
    };
    const onEnd = () => {
      const target = overRef.current;
      justDragged.current = true;
      setTimeout(() => (justDragged.current = false), 400);
      if (target) drop(target.status, target.index);
      else endDrag();
    };
    window.addEventListener("touchmove", onMoveTouch, { passive: false });
    window.addEventListener("touchend", onEnd);
    window.addEventListener("touchcancel", endDrag);
    frame = requestAnimationFrame(autoscroll);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("touchmove", onMoveTouch);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", endDrag);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragging]);

  function onTouchStart(e: React.TouchEvent, t: TaskCard) {
    if (!onMove) return;
    const touch = e.touches[0];
    if (!touch) return;
    const { clientX: x, clientY: y } = touch;
    press.current = {
      x,
      y,
      id: t.id,
      timer: setTimeout(() => {
        navigator.vibrate?.(12);
        setGhost({ x, y, title: t.subject });
        setDragging(t.id);
      }, LONG_PRESS_MS),
    };
  }
  function onTouchMove(e: React.TouchEvent) {
    const p = press.current;
    const touch = e.touches[0];
    // Le doigt bouge avant l'appui long : c'est un défilement, pas un glisser.
    if (p && !dragging && touch && Math.hypot(touch.clientX - p.x, touch.clientY - p.y) > 10) {
      clearTimeout(p.timer);
      press.current = null;
    }
  }
  function onTouchEnd() {
    if (press.current && !dragging) clearTimeout(press.current.timer);
  }

  // ─── Clavier ──────────────────────────────────────────────────────
  function onKeyDown(e: React.KeyboardEvent, t: TaskCard) {
    if (!onMove || !e.altKey || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) return;
    e.preventDefault();
    const col = BOARD_STATUSES.indexOf(t.status as (typeof BOARD_STATUSES)[number]);
    const cards = column(t.status);
    const i = cards.findIndex((c) => c.id === t.id);
    if (e.key === "ArrowLeft" && col > 0) move(t.id, BOARD_STATUSES[col - 1]!, column(BOARD_STATUSES[col - 1]!).length, true);
    if (e.key === "ArrowRight" && col >= 0 && col < BOARD_STATUSES.length - 1) move(t.id, BOARD_STATUSES[col + 1]!, column(BOARD_STATUSES[col + 1]!).length, true);
    if (e.key === "ArrowUp" && i > 0) move(t.id, t.status, i - 1, true);
    if (e.key === "ArrowDown" && i < cards.length - 1) move(t.id, t.status, i + 1, true);
  }

  return (
    <div ref={scroller} className="-mx-4 snap-x snap-mandatory overflow-x-auto px-4 pb-2 md:-mx-0 md:snap-none md:px-0">
      {onMove && (
        <p className="sr-only" id="board-help">
          Sur une carte : Alt + flèche gauche ou droite pour changer de colonne, Alt + flèche haut ou bas pour changer l&apos;ordre.
        </p>
      )}
      <p className="sr-only" aria-live="polite">{announce}</p>
      <div className="grid min-w-[880px] grid-cols-5 gap-2.5 max-md:min-w-[1150px]">
        {BOARD_STATUSES.map((status) => {
          const cards = column(status);
          return (
            <section
              key={status}
              data-status={status}
              aria-label={label(status)}
              className={`flex min-h-48 snap-start flex-col rounded-xl border bg-surface-2/40 p-2 transition ${
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
                <span>{label(status)}</span>
                <span className="tabular-nums">{cards.length}</span>
              </h3>
              <ol className="flex flex-1 flex-col gap-2">
                {cards.map((t, i) => (
                  <li
                    key={t.id}
                    data-card={t.id}
                    draggable={!!onMove}
                    aria-describedby={onMove ? "board-help" : undefined}
                    onDragStart={(e) => {
                      e.dataTransfer.effectAllowed = "move";
                      setDragging(t.id);
                    }}
                    onDragEnd={endDrag}
                    onDragOver={(e) => {
                      if (!onMove) return;
                      e.preventDefault();
                      e.stopPropagation();
                      const rect = e.currentTarget.getBoundingClientRect();
                      const index = e.clientY < rect.top + rect.height / 2 ? i : i + 1;
                      if (over?.status !== status || over.index !== index) setOver({ status, index });
                    }}
                    onTouchStart={(e) => onTouchStart(e, t)}
                    onTouchMove={onTouchMove}
                    onTouchEnd={onTouchEnd}
                    onKeyDown={(e) => onKeyDown(e, t)}
                    // Après un glisser au doigt, le relâchement ne doit pas ouvrir la carte.
                    onClickCapture={(e) => justDragged.current && e.preventDefault()}
                    style={{ WebkitTouchCallout: "none" }}
                    className={`relative select-none ${dragging === t.id ? "opacity-40" : ""} ${onMove ? "cursor-grab active:cursor-grabbing" : ""}`}
                  >
                    {over?.status === status && over.index === i && dragging && dragging !== t.id && (
                      <span aria-hidden className="absolute -top-1.5 left-0 right-0 h-0.5 rounded bg-accent" />
                    )}
                    <TaskCardView task={t} href={`${basePath}/${t.id}`} viewer={viewer} />
                  </li>
                ))}
                {over?.status === status && over.index === cards.length && dragging && <li aria-hidden className="h-0.5 rounded bg-accent" />}
              </ol>
            </section>
          );
        })}
      </div>
      {ghost && (
        <div
          aria-hidden
          className="pointer-events-none fixed z-[70] line-clamp-2 w-[200px] -translate-x-1/2 -translate-y-[120%] rounded-lg border border-accent/60 bg-surface px-3 py-2 text-[13px] font-medium shadow-2xl"
          // Gardée dans l'écran même quand le doigt est près d'un bord.
          style={{ left: Math.min(Math.max(ghost.x, 108), (typeof window === "undefined" ? 400 : window.innerWidth) - 108), top: ghost.y }}
        >
          {ghost.title}
        </div>
      )}
    </div>
  );
}
