import { LoginForm } from "./login-form";
import { LogoMark } from "@/components/icons";

export const metadata = { title: "Connexion · Cockpit" };

const ACCESS_REMOVED = "Votre accès à l'espace membre n'est plus actif. Contactez-nous si c'est une erreur.";
// Tout autre code vient de la validation du lien magique (expiré, déjà utilisé, invalide).
const BAD_LINK = "Ce lien de connexion a expiré ou a déjà servi. Demandez-en un nouveau.";

// Page vue par l'admin ET par les clients : vouvoiement, ton neutre.
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const error = (await searchParams).error;
  return (
    <main className="grid min-h-dvh place-items-center bg-bg px-4 py-10">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex items-center gap-2.5 text-accent">
          <LogoMark />
          <span className="font-display text-[17px] font-semibold text-text">Cockpit</span>
        </div>
        <div className="card space-y-6 p-7 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_-12px_rgba(0,0,0,0.12)]">
          <div className="space-y-1.5">
            <h1 className="page-title">Connexion</h1>
            <p className="text-sm text-muted">Recevez un lien de connexion par email. Pas de mot de passe à retenir.</p>
          </div>
          {error && (
            <p className="rounded-lg bg-critical/10 px-3 py-2.5 text-sm text-critical" role="alert">
              {error === "acces-retire" ? ACCESS_REMOVED : BAD_LINK}
            </p>
          )}
          <LoginForm />
        </div>
      </div>
    </main>
  );
}
