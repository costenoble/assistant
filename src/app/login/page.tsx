import { LoginForm } from "./login-form";

export const metadata = { title: "Connexion · Cockpit" };

const ERRORS: Record<string, string> = {
  "lien-invalide": "Ce lien de connexion a expiré ou a déjà servi. Demandez-en un nouveau.",
  "acces-retire": "Votre accès à l'espace client n'est plus actif. Contactez-nous si c'est une erreur.",
};

// Page vue par l'admin ET par les clients : vouvoiement, ton neutre.
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const error = (await searchParams).error;
  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <div className="card w-full max-w-sm space-y-6 p-8">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-widest text-accent">Cockpit</p>
          <h1 className="text-2xl font-semibold">Connexion</h1>
          <p className="text-sm text-muted">Recevez un lien de connexion par email, sans mot de passe.</p>
        </div>
        {error && ERRORS[error] && <p className="text-sm text-danger" role="alert">{ERRORS[error]}</p>}
        <LoginForm />
      </div>
    </main>
  );
}
