# Architecture

## Principe : un seul flux

Tout ce qui demande une action devient une ligne dans **`items`**, quelle que soit sa provenance. L'UI ne connaît que ce flux ; les connecteurs ne font qu'y écrire.

```
 Hostinger IMAP ──┐
 Microsoft Graph ─┼──► connecteurs ──► items ──► moteur de priorité ──► UI
 SaaS (ingest) ───┤                       │        (recalcul à chaque synchro)
 Saisie rapide ───┘                        └─ email_messages (détails mail 1-1)
```

## Arborescence

```
src/
├─ app/
│  ├─ (app)/                 UI admin : Aujourd'hui, Mails, Tâches, Clients, Réglages
│  │  ├─ actions.ts          Server Actions (requireOwner)
│  │  └─ clients/            CRM : fiches, contacts, accès portail, projets
│  ├─ portail/               Espace client (requireClient, vouvoiement)
│  ├─ api/
│  │  ├─ ingest/             API SaaS (clé Bearer → source)
│  │  ├─ cron/sync/          Synchro complète (CRON_SECRET)
│  │  ├─ auth/[...all]/      Validation du lien magique (GET seulement)
│  │  └─ auth/microsoft/     OAuth login + callback
│  └─ login/
├─ lib/
│  ├─ priority/score.ts      ★ Moteur de priorité (pur, testé)
│  ├─ mail/                  IMAP incrémental + parsing (pur, testé)
│  ├─ microsoft/             OAuth + synchro Graph
│  ├─ ingest/                Schéma Zod de l'API + clés
│  ├─ items/                 repo (upsert idempotent, recalcul) + queries (UI)
│  ├─ quick-add/             Parseur langage naturel (testé)
│  ├─ time/paris.ts          Dates en Europe/Paris quel que soit le serveur
│  └─ sync/run.ts            Orchestrateur (connecteurs isolés les uns des autres)
├─ components/
│  ├─ db/                    Schéma Drizzle, connexion, types
│  └─ auth/                  Better Auth · requireOwner · requireClient · access (périmètre client)
└─ proxy.ts                  Premier filtre : pas de cookie de session → /login
drizzle/                     Migrations SQL (générées depuis le schéma + triggers)
```

## Décisions

| Sujet | Choix | Pourquoi |
|---|---|---|
| Modèle | Table `items` unifiée + tables de détail | Une seule requête pour « qu'est-ce que je dois faire ? » ; chaque source garde ses champs spécifiques à côté |
| Idempotence | `unique(source_id, external_id)` | Les connecteurs peuvent rejouer sans doublon ; un SaaS renvoie le même id pour mettre à jour |
| Décisions utilisateur | Jamais écrasées par une synchro | Statut, priorité manuelle, report ne changent que si la source impose explicitement un statut |
| Base | Postgres chez Neon, accès par Drizzle (`pg`, URL « pooled ») | Postgres standard, typé de bout en bout ; s'endort quand personne ne s'en sert |
| Sécurité | Le navigateur ne parle **jamais** à la base : tout passe par le serveur (pages, Server Actions, routes) | Pas d'API de données exposée, donc pas de RLS à maintenir ; les jetons Microsoft ne quittent pas le serveur |
| Connexion | Better Auth, lien magique seulement (15 min, usage unique, jeton hashé en base). Demande de lien et déconnexion via Server Actions ; seule la validation du lien est une route publique | Pas de mot de passe à gérer ; aucun point d'entrée public pour créer un compte |
| Rôles | Admin = `OWNER_EMAIL`. Client = un `client_contacts` avec `portal_access` et le même email. Vérifié à la demande du lien, à la création du compte, puis à **chaque requête** | Rien à synchroniser entre « comptes » et « contacts » ; retirer l'accès = un booléen, effet immédiat |
| Isolation client | Toute lecture du portail passe par `lib/auth/access.ts`, bornée aux `clientIds` renvoyés par `requireClient()` | Un seul endroit à relire et à tester (`access.test.ts`) ; une page du portail ne doit jamais interroger la base directement |
| Mono-admin | Pas de colonne `owner_id` | Un seul admin : la colonne n'apportait plus rien sans RLS |
| Clés SaaS | sha256 en base, affichées une fois, rotation en 1 clic | Standard type GitHub/Stripe |
| Partageable vs interne | Rien d'interne dans une table lue par le portail (notes internes, mails, tâches → tables admin) | Une requête du portail ne peut pas ramener une colonne sensible par accident |
| Projets | `draft` = privé ; tout autre statut = visible du client | Tu prépares sans que le client voie un chantier vide |
| Priorité | Règles déterministes + raisons affichées | Compréhensible et réglable ; un LLM pourra venir *en plus* (voir roadmap) |
| Fréquence | Vercel Cron → `/api/cron/sync` : 1/jour sur Hobby, 15 min en Pro | 15 min tient dans le plan gratuit de Neon |
| Migrations | Appliquées par Vercel avant le build, en production seulement | Les URLs Neon sont « sensibles » (illisibles en local) ; un échec bloque le déploiement |
| Tests | Vitest + PGlite (Postgres en mémoire) avec les vraies migrations | Les requêtes, le trigger et le parcours de connexion sont testés sans base externe |
| Fuseau | Toutes les dates « murales » calculées en Europe/Paris | Vercel tourne en UTC |

## Moteur de priorité

Score 0-100 → `critical ≥ 70`, `high ≥ 45`, `normal ≥ 20`, sinon `low`.

| Signal | Points |
|---|---|
| Priorité source urgent / haute / normale | +40 / +25 / +10 |
| En retard · échéance < 24 h · < 3 j · < 7 j | +45 · +35 · +20 · +10 |
| RDV en cours ou < 2 h · < 24 h | +50 · +25 |
| Mot-clé d'urgence | +15 |
| Mail sans réponse · depuis > 1 j · > 3 j | +15 · +10 · +20 |
| Expéditeur VIP / règle personnalisée | +25 / ±50 |
| Newsletter | −30 |
| En attente d'un tiers | −20 |
| Pas trié depuis > 2 j | +10 |
| Priorité manuelle | remplace tout |

Ajuster : `src/lib/priority/score.ts` + tests dans `score.test.ts`.

## Roadmap

Vision : l'outil unique — assistant perso **et** gestion client (CRM, support, livrables).

| Phase | Contenu | État |
|---|---|---|
| 0. Fondations | Corrections synchro, modèle admin + clients, portail minimal, passage à Neon + Better Auth | ✅ |
| 1. CRM | Rattachement auto des mails / items à un client (domaines), fil d'activité et notes internes par client, vue projet | |
| 2. Tickets & support | Demandes depuis le portail, par mail ou SaaS ; fil de discussion, statuts, SLA, pièces jointes (Vercel Blob) ; dans le flux « Aujourd'hui » | |
| 3. Livrables & previews | Maquettes versionnées (images, PDF, Figma), commentaires épinglés sur l'image, validation client ; sites testables en direct via les previews Vercel en iframe | |
| 4. IA | Brief du matin, tri des tickets, brouillons de réponse, génération de maquettes / idées de site publiées en preview | |
| Plus tard | Devis / factures (brancher Kompta.pro), temps passé | |

Idées transverses :

1. **Notifications** : push web (PWA) ou Telegram le matin (brief du jour) et 15 min avant chaque RDV.
2. **Résumé IA des mails** : classement « demande une action / info / pub » + brouillon de réponse (Mistral sur ton serveur IA local, ou API).
3. **Envoi de réponses** depuis Cockpit (SMTP Hostinger, `Mail.Send` Graph).
4. **Microsoft To Do / Planner** (Semaphors) en plus des mails drapeautés.
5. **Revue hebdo** : ce qui a été fait, ce qui traîne, ce qui arrive.
6. **Recherche plein texte** (`tsvector` Postgres) sur tous les items.
7. **Raccourcis clavier** (j/k, e = fait, s = reporter) et mode mobile PWA.
