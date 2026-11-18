import Link from "next/link";
import { requireClient } from "@/lib/auth/require-client";
import { signOut } from "@/app/login/actions";
import { LogoMark } from "@/components/icons";

export const metadata = { title: "Espace membre" };

/** Portail client : thème clair, vouvoiement, une seule colonne lisible. */
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const { contact, clients } = await requireClient();
  return (
    <div className="min-h-dvh bg-bg">
      <header className="border-b border-border bg-surface pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3 md:px-6">
          <Link href="/portail" className="flex items-center gap-3">
            <span className="text-accent"><LogoMark /></span>
            <span className="flex flex-col leading-tight">
              <span className="font-display text-[15px] font-semibold">Espace membre</span>
              <span className="text-xs text-muted">{clients.map((c) => c.name).join(" · ")}</span>
            </span>
          </Link>
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden text-muted sm:inline">{contact.full_name}</span>
            <form action={signOut}>
              <button className="btn">Se déconnecter</button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8 md:px-6 md:py-10">{children}</main>
    </div>
  );
}
