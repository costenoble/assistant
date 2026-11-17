"use client";

import { useEffect, useState, useTransition } from "react";
import { sendTestPushAction, subscribePushAction, unsubscribePushAction } from "@/app/(app)/notifications/actions";

function keyToBytes(base64: string) {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/** Nom lisible de l'appareil, pour s'y retrouver dans la liste. */
function deviceName() {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return "iPhone";
  if (/iPad/.test(ua)) return "iPad";
  if (/Android/.test(ua)) return "Android";
  if (/Macintosh/.test(ua)) return "Mac";
  if (/Windows/.test(ua)) return "PC Windows";
  return "Navigateur";
}

/** Le service worker, enregistré au besoin (il ne l'est d'office qu'en production). */
async function registration() {
  return (await navigator.serviceWorker.getRegistration("/")) ?? (await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }));
}

type State = "loading" | "unsupported" | "ios-install" | "denied" | "off" | "on";

/** Activer les notifications sur cet appareil (téléphone ou ordinateur). */
export function PushSettings({ publicKey }: { publicKey: string | null }) {
  const [state, setState] = useState<State>("loading");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      // Sur iPhone, les notifications n'existent que pour l'app installée sur l'écran d'accueil.
      setState(ios && !standalone ? "ios-install" : "unsupported");
      return;
    }
    if (Notification.permission === "denied") return setState("denied");
    registration()
      .then(async (reg) => setState((await reg.pushManager.getSubscription()) ? "on" : "off"))
      .catch(() => setState("unsupported"));
  }, []);

  const enable = () =>
    start(async () => {
      setMessage(null);
      if (!publicKey) return setMessage("Les clés de notification ne sont pas configurées sur le serveur (VAPID).");
      const permission = await Notification.requestPermission();
      if (permission !== "granted") return setState(permission === "denied" ? "denied" : "off");
      const reg = await registration();
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(publicKey) });
      await subscribePushAction(JSON.parse(JSON.stringify(sub)), deviceName());
      setState("on");
      setMessage("Activé sur cet appareil.");
    });
  const disable = () =>
    start(async () => {
      const reg = await registration();
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await unsubscribePushAction(sub.endpoint);
        await sub.unsubscribe();
      }
      setState("off");
      setMessage("Désactivé sur cet appareil.");
    });
  const test = () =>
    start(async () => {
      const r = await sendTestPushAction();
      setMessage(r.sent ? "Notification de test envoyée." : "Aucun appareil n'a pu être joint.");
    });

  return (
    <div className="space-y-3">
      {state === "loading" && <p className="text-sm text-muted">Vérification…</p>}
      {state === "unsupported" && <p className="text-sm text-muted">Ce navigateur ne gère pas les notifications. Sur ordinateur, utilise Chrome, Edge, Firefox ou Safari récent.</p>}
      {state === "ios-install" && (
        <p className="text-sm leading-6">
          Sur iPhone, installe d&apos;abord Cockpit sur l&apos;écran d&apos;accueil : dans Safari, touche <strong>Partager</strong> puis
          <strong> « Sur l&apos;écran d&apos;accueil »</strong>. Ouvre ensuite Cockpit depuis son icône et reviens ici.
        </p>
      )}
      {state === "denied" && <p className="text-sm text-high">Les notifications sont bloquées pour Cockpit. Autorise-les dans les réglages du navigateur (ou de l&apos;iPhone : Réglages → Notifications → Cockpit).</p>}
      {(state === "off" || state === "on") && (
        <div className="flex flex-wrap items-center gap-2">
          {state === "off" ? (
            <button type="button" className="btn-primary" onClick={enable} disabled={pending}>Activer sur cet appareil</button>
          ) : (
            <>
              <span className="text-sm text-ok">Activées sur cet appareil.</span>
              <button type="button" className="btn" onClick={test} disabled={pending}>Envoyer un test</button>
              <button type="button" className="btn-ghost" onClick={disable} disabled={pending}>Désactiver</button>
            </>
          )}
        </div>
      )}
      {message && <p className="text-sm text-muted" role="status">{message}</p>}
    </div>
  );
}
