"use client";

import { useState, useTransition } from "react";
import { rotateSourceKey, toggleSource, deleteMailRule, disconnectMs } from "../actions";
import { KeyReveal } from "./create-source-form";

export function SourceControls({ id, active, isSaas }: { id: string; active: boolean; isSaas: boolean }) {
  const [pending, start] = useTransition();
  const [key, setKey] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      <div className="flex gap-1">
        {isSaas && (
          <button
            className="btn-ghost"
            disabled={pending}
            onClick={() => {
              if (confirmRotate()) start(async () => setKey(await rotateSourceKey(id)));
            }}
          >
            Régénérer la clé
          </button>
        )}
        <button className="btn-ghost" disabled={pending} onClick={() => start(() => toggleSource(id, !active))}>
          {active ? "Désactiver" : "Activer"}
        </button>
      </div>
      {key && <KeyReveal value={key} />}
    </div>
  );
}

// window.confirm bloque le thread, mais reste le garde-fou le plus simple pour une action destructrice.
function confirmRotate() {
  return window.confirm("L'ancienne clé cessera de fonctionner immédiatement. Continuer ?");
}

export function DeleteRuleButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <button className="btn-ghost" disabled={pending} onClick={() => start(() => deleteMailRule(id))}>
      Supprimer
    </button>
  );
}

export function DisconnectMsButton() {
  const [pending, start] = useTransition();
  return (
    <button className="btn" disabled={pending} onClick={() => start(() => disconnectMs())}>
      Déconnecter
    </button>
  );
}
