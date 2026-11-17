import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Inter } from "next/font/google";
import "./globals.css";
import { ServiceWorker } from "@/components/pwa/service-worker";

// Inter pour le texte, Bricolage Grotesque pour les titres : chargées et servies par Next (pas d'appel à Google côté visiteur).
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const display = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-display-face", display: "swap" });

export const metadata: Metadata = {
  title: "Cockpit",
  description: "Mails, agenda, tâches, clients et projets au même endroit.",
  applicationName: "Cockpit",
  // Installée sur iPhone : plein écran, barre d'état fondue dans l'app.
  appleWebApp: { capable: true, title: "Cockpit", statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Contenu jusque sous l'encoche et la barre du bas ; les marges sont gérées en CSS (safe-area).
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0d0e10" },
    { media: "(prefers-color-scheme: light)", color: "#0d0e10" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={`${inter.variable} ${display.variable}`}>
      <body className="min-h-dvh font-sans">
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}
