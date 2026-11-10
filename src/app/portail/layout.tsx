import { requireClient } from "@/lib/auth/require-client";
import { signOut } from "@/app/login/actions";

export const metadata = { title: "Espace client · Cockpit" };

/** Portail client : interface séparée de l'admin, vouvoiement. */
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const { contact, clients } = await requireClient();
  return (
    <div className="mx-auto min-h-dvh max-w-4xl px-4 py-6 md:py-10">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-accent">Espace client</p>
          <p className="text-sm text-muted">{clients.map((c) => c.name).join(" · ")}</p>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-muted">{contact.full_name}</span>
          <form action={signOut}>
            <button className="btn">Se déconnecter</button>
          </form>
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}
