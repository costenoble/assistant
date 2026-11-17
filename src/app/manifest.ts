import type { MetadataRoute } from "next";

/** Cockpit s'installe comme une app (écran d'accueil, plein écran). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Cockpit",
    short_name: "Cockpit",
    description: "Mails, tâches, espaces de travail, réunions et clients au même endroit.",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0d0e10",
    theme_color: "#0d0e10",
    lang: "fr",
    categories: ["productivity", "business"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Lancer une réunion", url: "/reunions", icons: [{ src: "/icon-192.png", sizes: "192x192" }] },
      { name: "Mails", url: "/inbox", icons: [{ src: "/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
