import { requireOwner } from "@/lib/auth/require-owner";
import { getSources } from "@/lib/items/queries";
import { createAdminClient } from "@/lib/supabase/admin";
import { env, mailAccounts, microsoftConfig } from "@/lib/env";
import { addMailRule } from "../actions";
import { CreateSourceForm } from "./create-source-form";
import { DeleteRuleButton, DisconnectMsButton, SourceControls } from "./source-actions";
import { CONTEXT_LABELS, ITEM_CONTEXTS, type MailRule } from "@/lib/db/types";
import { relative } from "@/lib/time/paris";

export const dynamic = "force-dynamic";

const MS_MESSAGES: Record<string, string> = {
  ok: "Microsoft 365 connecté. Agenda et mails drapeautés synchronisés.",
  erreur: "La connexion Microsoft a échoué (voir les logs serveur).",
  "state-invalide": "Session OAuth expirée, recommence.",
};

const RULE_LABELS: Record<MailRule["match_type"], string> = {
  from_domain: "Domaine",
  from_address: "Adresse",
  subject_contains: "Objet contient",
};

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ ms?: string }> }) {
  const { supabase } = await requireOwner();
  const ms = (await searchParams).ms;
  const [sources, { data: rules }, { data: msToken }] = await Promise.all([
    getSources(supabase),
    supabase.from("mail_rules").select("*").order("created_at"),
    // oauth_tokens n'est lisible qu'en service_role : on n'en lit que l'email.
    createAdminClient().from("oauth_tokens").select("account_email, updated_at").eq("provider", "microsoft").maybeSingle(),
  ]);
  const accounts = mailAccounts();
  const appUrl = env().NEXT_PUBLIC_APP_URL;

  return (
    <div className="max-w-4xl space-y-8">
      <h1 className="text-2xl font-semibold">Réglages</h1>

      {/* ─── Sources ─── */}
      <section className="card divide-y divide-border">
        <h2 className="section-title px-5 py-3">Sources connectées</h2>
        {sources.length === 0 && <p className="px-5 py-4 text-sm text-muted">Aucune source pour l&apos;instant. Lance une synchro ou crée une clé SaaS.</p>}
        {sources.map((s) => (
          <div key={s.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-3">
            <div className="space-y-0.5">
              <p className="font-medium">
                {s.name} <span className="text-xs font-normal text-muted">({s.kind}{s.api_key_hint ? ` · …${s.api_key_hint}` : ""})</span>
              </p>
              <p className="text-xs text-muted">
                {s.active ? "Active" : "Désactivée"} · dernière synchro {s.last_sync_at ? relative(s.last_sync_at) : "jamais"}
              </p>
              {s.last_error && <p className="text-xs text-danger">Erreur : {s.last_error}</p>}
            </div>
            <SourceControls id={s.id} active={s.active} isSaas={s.kind === "saas"} />
          </div>
        ))}
      </section>

      {/* ─── Microsoft 365 ─── */}
      <section className="card space-y-3 p-5">
        <h2 className="section-title">Microsoft 365 · Semaphors</h2>
        {ms && <p className="text-sm">{MS_MESSAGES[ms] ?? `Microsoft : ${ms}`}</p>}
        {!microsoftConfig() ? (
          <p className="text-sm text-muted">Renseigne MS_CLIENT_ID et MS_CLIENT_SECRET (voir README) pour activer l&apos;agenda Outlook.</p>
        ) : msToken ? (
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm">Connecté en tant que <strong>{msToken.account_email ?? "?"}</strong></p>
            <DisconnectMsButton />
          </div>
        ) : (
          <a href="/api/auth/microsoft/login" className="btn-primary">Connecter Outlook</a>
        )}
      </section>

      {/* ─── Mails ─── */}
      <section className="card space-y-4 p-5">
        <h2 className="section-title">Boîtes mail (IMAP)</h2>
        {accounts.length ? (
          <ul className="space-y-1 text-sm">
            {accounts.map((a) => (
              <li key={a.id}>
                <strong>{a.label ?? a.id}</strong> — {a.user} @ {a.host}:{a.port} ({a.mailboxes.join(", ")})
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">Aucune boîte configurée. Ajoute MAIL_ACCOUNTS dans les variables d&apos;environnement.</p>
        )}

        <div className="space-y-2">
          <h3 className="text-sm font-medium">Règles de tri</h3>
          <p className="text-xs text-muted">
            VIP = remonte en priorité · Ignorer = jamais dans les urgences · le contexte classe le mail (ex. @semaphors.fr → Semaphors).
          </p>
          <ul className="divide-y divide-border rounded-lg border border-border">
            {(rules as MailRule[] | null)?.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                <span>
                  <span className="text-muted">{RULE_LABELS[r.match_type]}</span> <code>{r.pattern}</code>
                  {r.context && <> → {CONTEXT_LABELS[r.context]}</>}
                  {r.action !== "none" && <> · <strong>{r.action === "vip" ? "VIP" : "Ignorer"}</strong></>}
                </span>
                <DeleteRuleButton id={r.id} />
              </li>
            ))}
            {!rules?.length && <li className="px-3 py-2 text-sm text-muted">Aucune règle.</li>}
          </ul>
          <form action={addMailRule} className="grid gap-2 sm:grid-cols-[auto_1fr_auto_auto_auto]">
            <select name="match_type" className="input" defaultValue="from_domain">
              <option value="from_domain">Domaine</option>
              <option value="from_address">Adresse</option>
              <option value="subject_contains">Objet contient</option>
            </select>
            <input name="pattern" required placeholder="semaphors.fr" className="input" />
            <select name="context" className="input" defaultValue="">
              <option value="">Contexte…</option>
              {ITEM_CONTEXTS.map((c) => <option key={c} value={c}>{CONTEXT_LABELS[c]}</option>)}
            </select>
            <select name="action" className="input" defaultValue="none">
              <option value="none">—</option>
              <option value="vip">VIP</option>
              <option value="ignore">Ignorer</option>
            </select>
            <button className="btn-primary">Ajouter</button>
          </form>
        </div>
      </section>

      {/* ─── API SaaS ─── */}
      <section className="card space-y-4 p-5">
        <h2 className="section-title">Brancher un SaaS</h2>
        <p className="text-sm text-muted">
          Chaque SaaS (Vigie SEO, Kompta.pro, app DPP…) reçoit sa propre clé et pousse ses tâches vers Cockpit.
        </p>
        <CreateSourceForm />
        <pre className="overflow-x-auto rounded-lg bg-surface-2 p-4 text-xs leading-relaxed">{`curl -X POST ${appUrl}/api/ingest \\
  -H "Authorization: Bearer ck_vigie-seo_…" \\
  -H "Content-Type: application/json" \\
  -d '{
    "items": [{
      "external_id": "audit-1234",
      "title": "Chute de 12 positions sur client-x.fr",
      "url": "https://vigie-seo.vercel.app/audits/1234",
      "priority": "high",
      "due_at": "2026-11-12T18:00:00+01:00"
    }]
  }'`}</pre>
      </section>
    </div>
  );
}
