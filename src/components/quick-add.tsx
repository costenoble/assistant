"use client";

import { useRef, useTransition } from "react";
import { quickAdd } from "@/app/(app)/actions";

export function QuickAdd() {
  const ref = useRef<HTMLFormElement>(null);
  const [pending, start] = useTransition();
  return (
    <form
      ref={ref}
      action={(fd) =>
        start(async () => {
          await quickAdd(fd);
          ref.current?.reset();
        })
      }
      className="flex gap-2"
    >
      <input
        name="text"
        required
        autoComplete="off"
        placeholder="Noter une chose… ex. « Rappeler Jean demain 14h #semaphors !! »"
        className="input flex-1"
        aria-label="Ajout rapide"
      />
      <button className="btn-primary" disabled={pending}>
        {pending ? "…" : "Ajouter"}
      </button>
    </form>
  );
}
