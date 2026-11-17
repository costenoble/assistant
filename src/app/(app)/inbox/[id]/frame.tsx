"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { IconImage } from "@/components/icons";

/**
 * Contenu d'un mail dans une iframe isolée : pas de scripts (sandbox sans
 * allow-scripts), rien d'extérieur sans ton accord (politique de contenu dans le
 * document). La hauteur suit le contenu.
 */
export function MailFrame({ blocked, withImages, remoteImages }: { blocked: string; withImages: string; remoteImages: number }) {
  const [images, setImages] = useState(false);
  const [height, setHeight] = useState(240);
  const ref = useRef<HTMLIFrameElement>(null);

  const measure = useCallback(() => {
    const doc = ref.current?.contentDocument;
    if (doc?.documentElement) setHeight(Math.min(Math.max(doc.documentElement.scrollHeight, 120), 20000));
  }, []);

  useEffect(() => {
    const frame = ref.current;
    if (!frame) return;
    let observer: ResizeObserver | null = null;
    const onLoad = () => {
      measure();
      const body = frame.contentDocument?.body;
      if (body && typeof ResizeObserver !== "undefined") {
        observer = new ResizeObserver(measure);
        observer.observe(body);
      }
    };
    frame.addEventListener("load", onLoad);
    return () => {
      frame.removeEventListener("load", onLoad);
      observer?.disconnect();
    };
  }, [measure, images]);

  return (
    <div className="space-y-2">
      {remoteImages > 0 && !images && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-surface-2/50 px-3 py-2 text-sm text-muted">
          <span className="flex items-center gap-2">
            <IconImage />
            {remoteImages} image{remoteImages > 1 ? "s" : ""} distante{remoteImages > 1 ? "s" : ""} bloquée{remoteImages > 1 ? "s" : ""} : elles peuvent servir à savoir que tu as ouvert le mail.
          </span>
          <button type="button" className="btn-ghost text-sm" onClick={() => setImages(true)}>Afficher les images</button>
        </div>
      )}
      <iframe
        key={images ? "images" : "blocked"}
        ref={ref}
        title="Contenu du mail"
        srcDoc={images ? withImages : blocked}
        // allow-same-origin sans allow-scripts : aucun script ne tourne, la page peut mesurer la hauteur.
        sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
        referrerPolicy="no-referrer"
        className="block w-full overflow-hidden rounded-xl border border-border bg-white"
        style={{ height }}
      />
    </div>
  );
}
