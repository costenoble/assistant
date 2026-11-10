# Cockpit

Ton hub perso : **mails Hostinger + agenda Outlook (Semaphors) + tâches de tes SaaS + saisie rapide**, dans un seul flux trié par priorité. Objectif : ne plus rien oublier.

> Next.js 16 (App Router) · Supabase (Postgres + Auth + pg_cron) · Vercel · TypeScript strict · Tailwind 4

---

## Ce que fait la v0.1

| Module | Ce qui marche |
|---|---|
| **Aujourd'hui** | « À faire maintenant » (top 12 par score), mails qui attendent une réponse, agenda du jour + demain, compteur retards / en attente |
| **Mails (IMAP Hostinger)** | Synchro incrémentale par UID, détection newsletters, extrait lisible, règles VIP / ignorer / contexte. Répondre depuis le webmail fait passer le mail en « traité » tout seul |
| **Microsoft 365** | OAuth délégué, agenda Outlook J-1 → J+14, mails drapeautés → tâches (avec échéance du drapeau). RDV supprimés / drapeaux retirés → fermés automatiquement |
| **API SaaS** | `POST /api/ingest` avec une clé par SaaS (hashée en base), idempotent par `external_id` |
| **Priorités** | Moteur pur et testé : échéance, retard, RDV imminent, mots-clés (« urgent », « relance », « impayé »…), mail sans réponse depuis X jours, VIP, override manuel. Chaque point affiche sa raison |
| **Saisie rapide** | `Rappeler Jean demain 14h #semaphors !!` → tâche datée (heure de Paris), contexte, priorité |

---

## Installation (≈ 20 min)

### 1. Supabase

1. Crée un projet sur [supabase.com](https://supabase.com) (région `eu-west-3` Paris).
2. SQL Editor → exécute `supabase/migrations/0001_init.sql`.
3. Authentication → Providers → Email : active **Magic Link**.
4. Authentication → URL Configuration : ajoute `https://<ton-app>.vercel.app/auth/callback` (et `http://localhost:3000/auth/callback`).

### 2. Variables d'environnement

```bash
cp .env.example .env.local
```

Remplis `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `OWNER_EMAIL`, `CRON_SECRET` (`openssl rand -hex 32`).

**Première connexion :** lance `npm run dev`, connecte-toi par magic link, puis copie ton UUID (Supabase → Authentication → Users) dans `OWNER_USER_ID`. Ensuite, **désactive les inscriptions** (Authentication → Sign In / Providers → « Allow new users to sign up » : off).

### 3. Mails Hostinger

Hostinger → Emails → ta boîte → *Configurer les appareils* : IMAP `imap.hostinger.com`, port `993`, SSL.

```env
MAIL_ACCOUNTS=[{"id":"cstlab","label":"cstlab.dev","host":"imap.hostinger.com","port":993,"user":"contact@cstlab.dev","password":"..."}]
```

Plusieurs boîtes ? Ajoute des objets au tableau. Autres dossiers : `"mailboxes":["INBOX","Clients"]`.

### 4. Microsoft 365 (Semaphors)

1. [Entra ID](https://entra.microsoft.com) → *App registrations* → *New registration*.
   - Types de comptes : « Comptes dans un annuaire organisationnel ».
   - Redirect URI (Web) : `https://<ton-app>.vercel.app/api/auth/microsoft/callback` (+ la version localhost).
2. *Certificates & secrets* → nouveau secret → `MS_CLIENT_SECRET`. *Overview* → `MS_CLIENT_ID`.
3. *API permissions* → Microsoft Graph (Delegated) : `User.Read`, `Calendars.Read`, `Mail.Read`, `offline_access`.
4. Réglages de Cockpit → **Connecter Outlook**.

> ⚠️ **Tenant Semaphors** : beaucoup de tenants bloquent le consentement utilisateur pour les apps tierces. Si tu vois « Approbation de l'administrateur requise », demande à l'admin M365 d'accorder le consentement (ou crée l'app directement dans le tenant Semaphors si tu en as les droits). Les permissions sont en lecture seule.

### 5. Déploiement Vercel

```bash
vercel link && vercel env pull   # ou ajoute les variables dans le dashboard
vercel --prod
```

### 6. Synchro automatique toutes les 5 min

Vercel Cron en plan Hobby ne tourne **qu'une fois par jour** (`vercel.json` le garde comme filet de sécurité). Pour la fréquence, Supabase appelle l'app :

1. Database → Extensions : active `pg_cron` et `pg_net`.
2. Remplace `<APP_URL>` et `<CRON_SECRET>` dans `supabase/migrations/0002_cron.sql` puis exécute-le.

Bouton **↻ Synchroniser** dans la barre latérale pour forcer à la main.

---

## Brancher un SaaS

Réglages → *Brancher un SaaS* → nom + slug → la clé s'affiche **une seule fois**.

```ts
// Dans Vigie SEO, Kompta.pro, l'app DPP…
await fetch(`${process.env.COCKPIT_URL}/api/ingest`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${process.env.COCKPIT_API_KEY}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    items: [
      {
        external_id: `invoice-${invoice.id}`,     // stable : renvoyer = mettre à jour
        title: `Relancer ${client.name} — facture ${invoice.number}`,
        url: `https://kompta.pro/factures/${invoice.id}`,
        priority: "high",                          // urgent | high | normal | low (ou 1-4)
        due_at: invoice.dueDate.toISOString(),     // ISO 8601 avec fuseau
        context: "freelance",                      // perso | freelance | semaphors | saas
        metadata: { amount: invoice.total },
      },
    ],
  }),
});

// Quand c'est réglé côté SaaS :
// { items: [{ external_id: "invoice-42", title: "...", status: "done" }] }
```

| Champ | Type | Notes |
|---|---|---|
| `external_id` | string ≤ 200 | **obligatoire**, unique par SaaS |
| `title` | string ≤ 500 | **obligatoire** |
| `kind` | `task` \| `followup` \| `event` | défaut `task` |
| `priority` | `urgent` `high` `normal` `low` ou 1-4 | |
| `due_at`, `starts_at`, `ends_at` | ISO 8601 + fuseau | `2026-11-12T18:00:00+01:00` |
| `status` | `open` `waiting` `done` `cancelled` | absent = on garde le choix de l'utilisateur |
| `body`, `url`, `context`, `metadata` | | |

Mise à jour partielle : renvoyer un `external_id` connu ne modifie que les champs présents. Un champ absent est conservé, `null` l'efface.

Réponses : `200 { upserted, ids }` · `401` clé absente/invalide · `422` validation (détail dans `issues`) · 100 items max par appel.

---

## Développement

```bash
npm install
npm run dev         # http://localhost:3000
npm test            # moteur de priorité, parsing mails, saisie rapide, API
npm run typecheck
npm run build
```

Voir [`ARCHITECTURE.md`](./ARCHITECTURE.md) pour le fonctionnement interne et la roadmap.
