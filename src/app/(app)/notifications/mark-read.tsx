"use client";

import { useEffect } from "react";
import { markAllReadAction } from "./actions";

/**
 * Marque tout comme lu une fois la page réellement affichée (et pas lors d'un
 * préchargement de lien). Les nouveautés restent surlignées pour cet affichage.
 */
export function MarkRead() {
  useEffect(() => {
    const t = setTimeout(() => void markAllReadAction(), 1500);
    return () => clearTimeout(t);
  }, []);
  return null;
}
