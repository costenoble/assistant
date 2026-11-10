-- ════════════════════════════════════════════════════════════════════
-- Cockpit — schéma initial
-- Un seul flux unifié (`items`) alimenté par : mails IMAP, Microsoft 365,
-- SaaS (API d'ingestion) et saisie manuelle. Tout ce qui doit être traité
-- finit dans `items`, avec un score de priorité recalculé régulièrement.
-- ════════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;

-- ─── Types ──────────────────────────────────────────────────────────
create type source_kind   as enum ('mail', 'microsoft', 'saas', 'manual');
create type item_kind     as enum ('task', 'email', 'event', 'followup');
create type item_status   as enum ('inbox', 'todo', 'in_progress', 'waiting', 'done', 'archived');
create type item_context  as enum ('perso', 'freelance', 'semaphors', 'saas');
create type priority_level as enum ('critical', 'high', 'normal', 'low');

-- ─── Sources ────────────────────────────────────────────────────────
-- Chaque provenance d'items. Pour les SaaS, `api_key_hash` = sha256 de la clé.
create table sources (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references auth.users(id) on delete cascade,
  slug          text not null,
  name          text not null,
  kind          source_kind not null,
  default_context item_context not null default 'perso',
  api_key_hash  text unique,
  api_key_hint  text,                    -- 4 derniers caractères, pour l'affichage
  active        boolean not null default true,
  last_sync_at  timestamptz,
  last_error    text,
  created_at    timestamptz not null default now(),
  unique (owner_id, slug)
);

-- ─── Items (le flux unifié) ─────────────────────────────────────────
create table items (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid not null references auth.users(id) on delete cascade,
  source_id        uuid references sources(id) on delete set null,
  external_id      text,                         -- id côté source (idempotence)
  kind             item_kind not null default 'task',
  context          item_context not null default 'perso',
  status           item_status not null default 'inbox',
  title            text not null check (char_length(title) between 1 and 500),
  body             text,
  url              text,
  -- Priorité
  source_priority  smallint check (source_priority between 1 and 4), -- 1 = urgent … 4 = bas
  manual_priority  priority_level,               -- override manuel, prime sur le calcul
  priority_score   smallint not null default 0,
  priority_level   priority_level not null default 'normal',
  priority_reasons jsonb not null default '[]'::jsonb,
  -- Temps
  due_at           timestamptz,
  starts_at        timestamptz,
  ends_at          timestamptz,
  snoozed_until    timestamptz,
  completed_at     timestamptz,
  metadata         jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (source_id, external_id)
);

create index items_open_idx      on items (owner_id, priority_score desc) where status not in ('done', 'archived');
create index items_due_idx       on items (owner_id, due_at) where due_at is not null and status not in ('done', 'archived');
create index items_events_idx    on items (owner_id, starts_at) where kind = 'event';
create index items_kind_status   on items (owner_id, kind, status);

-- ─── Détails des mails ──────────────────────────────────────────────
create table email_messages (
  item_id        uuid primary key references items(id) on delete cascade,
  account_id     text not null,                 -- id du compte dans MAIL_ACCOUNTS
  mailbox        text not null default 'INBOX',
  uid            bigint not null,
  uid_validity   bigint not null,
  message_id     text,
  from_address   text,
  from_name      text,
  to_addresses   text[] not null default '{}',
  subject        text,
  snippet        text,
  received_at    timestamptz not null,
  is_seen        boolean not null default false,
  is_answered    boolean not null default false,
  is_bulk        boolean not null default false, -- newsletter / notification automatique
  unique (account_id, mailbox, uid_validity, uid)
);
create index email_from_idx on email_messages (from_address);

-- ─── Règles de tri des mails ────────────────────────────────────────
-- Ex. : tout ce qui vient de @semaphors.fr → contexte semaphors ; client X → VIP.
create type rule_match as enum ('from_domain', 'from_address', 'subject_contains');
create type rule_action as enum ('vip', 'ignore', 'none');

create table mail_rules (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null references auth.users(id) on delete cascade,
  match_type     rule_match not null,
  pattern        text not null,
  context        item_context,
  priority_boost smallint not null default 0 check (priority_boost between -50 and 50),
  action         rule_action not null default 'none',
  created_at     timestamptz not null default now()
);

-- ─── État de synchronisation (curseurs IMAP, deltas Graph…) ─────────
create table sync_state (
  key        text primary key,      -- ex. "imap:cstlab:INBOX"
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

-- ─── Jetons OAuth (Microsoft) — accessibles uniquement en service_role ──
create table oauth_tokens (
  provider      text primary key,   -- "microsoft"
  account_email text,
  access_token  text not null,
  refresh_token text not null,
  expires_at    timestamptz not null,
  scope         text,
  updated_at    timestamptz not null default now()
);

-- ─── updated_at automatique ─────────────────────────────────────────
create function touch_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  if new.status in ('done', 'archived') and old.status not in ('done', 'archived') then
    new.completed_at := now();
  elsif new.status not in ('done', 'archived') then
    new.completed_at := null;
  end if;
  return new;
end $$;

create trigger items_touch before update on items
  for each row execute function touch_updated_at();

-- ─── RLS ────────────────────────────────────────────────────────────
-- L'UI utilise la clé anon + session : chaque ligne est filtrée par owner_id.
-- Le cron et l'ingestion utilisent la clé service_role (bypass RLS).
alter table sources        enable row level security;
alter table items          enable row level security;
alter table email_messages enable row level security;
alter table mail_rules     enable row level security;
alter table sync_state     enable row level security;
alter table oauth_tokens   enable row level security;  -- aucune policy : service_role uniquement

create policy "owner sources"    on sources    for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owner items"      on items      for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owner mail_rules" on mail_rules for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owner emails"     on email_messages for select using (
  exists (select 1 from items i where i.id = item_id and i.owner_id = auth.uid())
);
