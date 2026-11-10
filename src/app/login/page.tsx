import { LoginForm } from "./login-form";

export const metadata = { title: "Connexion · Cockpit" };

export default function LoginPage() {
  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <div className="card w-full max-w-sm space-y-6 p-8">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-widest text-accent">Cockpit</p>
          <h1 className="text-2xl font-semibold">Connexion</h1>
          <p className="text-sm text-muted">Tout ce que tu as à faire, au même endroit.</p>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
