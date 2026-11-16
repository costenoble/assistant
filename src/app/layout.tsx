import type { Metadata, Viewport } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import "./globals.css";

// Inter pour le texte, Space Grotesk pour les titres : chargées et servies par Next (pas d'appel à Google côté visiteur).
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const display = Space_Grotesk({ subsets: ["latin"], variable: "--font-display-face", display: "swap" });

export const metadata: Metadata = {
  title: "Cockpit",
  description: "Mails, agenda, tâches, clients et projets au même endroit.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={`${inter.variable} ${display.variable}`}>
      <body className="min-h-dvh font-sans">{children}</body>
    </html>
  );
}
