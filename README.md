# Cockpit

Ton hub perso : **mails Hostinger + agenda Outlook (Semaphors) + tâches de tes SaaS + saisie rapide**, dans un seul flux trié par priorité. Objectif : ne plus rien oublier.

Il devient aussi l'outil de gestion client : **fiches clients, contacts, projets et portail client** où tes clients suivent leurs projets (puis, à venir : tickets, maquettes, previews de sites testables en direct).

> Next.js 16 (App Router) · Postgres (Neon) + Drizzle · Better Auth (lien magique) · Vercel · TypeScript strict · Tailwind 4

---

## Ce que fait la v0.1

| Module | Ce qui marche |
|---|---|
| **Aujourd'hui** | « À faire maintenant » (top 12 par score), mails qui attendent une réponse, agenda du jour + demain, compteur retards / en attente |
| **Mails (IMAP Hostinger)** | Synchro incrémentale par UID, détection newsletters, extrait lisible, règles VIP / ignorer / contexte. Répondre depuis le webmail fait passer le mail en « traité » tout seul |
| **Microsoft 365** | OAuth délégué, agenda Outlook J-1 → J+14, mails drapeautés → tâches (avec échéance du drapeau). RDV supprimés / drapeaux retirés → fermés automatiquement |
| **API SaaS** | `POST /api/ingest` avec une clé par SaaS (hashée en base), idempotent par `external_id` |
| **Priorités** | Moteur pur et testé : échéance, retard, RDV imminent, mots-clés (« urgent », « relance », « impayé »…), mail sans réponse depuis X jours, VIP, override manuel. Chaque point affiche sa raison |
| **Saisie rapide** | `Rappeler Jean demain 14h @cabinet-leroy !!` → tâche datée (heure de Paris), rattachée au client, priorité |
| **Clients** | Fiches clients (statut, site, domaines mail), contacts, projets. Un projet est en *brouillon* (privé) tant que tu ne le publies pas |
| **CRM** | Les mails sont rattachés tout seuls à leur client (adresse d'un contact, sinon domaine mail). Chaque fiche montre ce qui est à traiter pour ce client, ce qui a été clos, et des notes internes. Rattachement manuel sur chaque ligne, ou `@client` dans la saisie rapide |
| **Portail client** | `/portail` : chaque contact avec accès voit **uniquement** les projets publiés de son entreprise. Connexion par lien magique, accès retirable en 1 clic |

---

## Installation (≈ 20 min)

### 1. Vercel + base Neon

1. Importe le repo dans [Vercel](https://vercel.com/new).
2. Dans le projet : **Storage → Create Database → Neon**.
   - Région : **Frankfurt** (la plus proche ; `vercel.json` fait tourner l'app dans la même région).
   - **Auth : désactivé** et **Realtime : désactivé**. La connexion est gérée par l'app (Better Auth), dans ta propre base.
   - Plan **Free**.
3. Vercel ajoute tout seul `DATABASE_URL` et `DATABASE_URL_UNPOOLED` au projet.

### 2. Variables d'environnement

```bash
vercel link && vercel env pull .env.local   # récupère les variables Neon
```

Ajoute ensuite (dans `.env.local` **et** dans Vercel → Settings → Environment Variables), en t'aidant de `.env.example` :

| Variable | Valeur |
|---|---|
| `OWNER_EMAIL` | ton adresse : c'est la seule qui est admin |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` en local, `https://<ton-app>.vercel.app` sur Vercel |
| `BETTER_AUTH_SECRET` | `openssl rand -base64 32` |
| `CRON_SECRET` | `openssl rand -hex 32` |
| `SMTP_USER`, `SMTP_PASS` | ta boîte Hostinger : elle envoie les liens de connexion |

Les tables sont créées et mises à jour **automatiquement à chaque déploiement en production** (`scripts/migrate-on-deploy.mjs`, lancé avant le build). Rien à faire à la main.

> Les variables Neon sont marquées « Sensible » dans Vercel : `vercel env pull` les renvoie vides. Pour développer en local, utilise un Postgres local ou une branche Neon dédiée, et mets son URL dans `DATABASE_URL` de `.env.local`, puis `npm run db:migrate`.

**Première connexion :** `npm run dev`, puis demande un lien avec ton `OWNER_EMAIL`. Sans SMTP configuré, en local, le lien s'affiche dans le terminal.

> 🔐 **Qui peut se connecter ?** Toi (`OWNER_EMAIL`) et les contacts pour lesquels tu as cliqué « Ouvrir l'accès portail ». Personne d'autre ne peut créer de compte. Le lien est valable 15 minutes, une seule fois, et s'ouvre sur n'importe quel appareil.

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

### 5. Déploiement

Chaque `git push` sur `main` déploie, et applique d'abord les migrations en attente. Si une migration échoue, le déploiement échoue et l'ancienne version reste en ligne.

Quand tu modifies le schéma (`src/lib/db/schema.ts`), génère la migration et commite-la :

```bash
npm run db:generate   # écrit la migration SQL dans drizzle/
```

Les déploiements de preview partagent la base de production et ne la modifient pas.

### 6. Synchro automatique

`vercel.json` déclare un cron Vercel sur `/api/cron/sync`, protégé par `CRON_SECRET`.

- Réglage actuel : **une fois par jour à 6 h UTC** (`0 6 * * *`), le maximum du plan Hobby.
- **Plan Pro** (nécessaire pour un usage commercial) : passe à `*/15 * * * *`. 15 minutes laisse la base Neon s'endormir entre deux passages et reste dans son plan gratuit (100 h de calcul / mois).

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
npm test            # priorités, parsing, accès aux données, isolation du portail, connexion (Postgres en mémoire)
npm run typecheck
npm run build
```

Voir [`ARCHITECTURE.md`](./ARCHITECTURE.md) pour le fonctionnement interne et la roadmap.
