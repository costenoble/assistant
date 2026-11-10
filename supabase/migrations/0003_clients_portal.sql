-- ════════════════════════════════════════════════════════════════════
-- Cockpit — fondations multi-utilisateurs
-- Deux types de comptes :
--   · l'admin (toi) : voit et gère tout ;
--   · les contacts clients avec accès portail : ne voient QUE ce qui
--     concerne leur(s) client(s), et seulement les tables « partageables ».
--
-- Règle d'or : tout ce qu'un client peut lire vit dans des tables pensées
-- pour être partagées (clients, projects…). L'interne (notes, mails,
-- tâches, sources) reste dans des tables réservées à l'admin. La RLS
-- filtre des lignes, pas des colonnes : on ne mélange donc jamais les deux.
-- ════════════════════════════════════════════════════════════════════

-- ─── Admin ──────────────────────────────────────────────────────────
-- Rempli automatiquement par l'app à la connexion de OWNER_EMAIL.
create table admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table admins enable row level security; -- aucune policy : service_role uniquement

create function is_admin() returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (select 1 from admins where user_id = auth.uid())
$$;

-- ─── Clients (entreprises) ──────────────────────────────────────────
create type client_status as enum ('prospect', 'active', 'paused', 'archived');

create table clients (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references auth.users(id) on delete cascade,
  name          text not null check (char_length(name) between 1 and 200),
  slug          text not null check (slug ~ '^[a-z0-9-]{2,60}$'),
  status        client_status not null default 'active',
  website       text,
  -- Domaines mail du client (ex. {boulangerie-martin.fr}) : servira au rattachement auto des mails.
  email_domains text[] not null default '{}',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (owner_id, slug)
);

-- ─── Contacts clients ───────────────────────────────────────────────
-- portal_access + user_id = la personne peut se connecter au portail.
create table client_contacts (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references auth.users(id) on delete cascade,
  client_id     uuid not null references clients(id) on delete cascade,
  full_name     text not null check (char_length(full_name) between 1 and 200),
  email         text check (email is null or email = lower(email)),
  phone         text,
  job_title     text,
  portal_access boolean not null default false,
  user_id       uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  unique (client_id, email)
);
create index client_contacts_user_idx  on client_contacts (user_id) where user_id is not null;
create index client_contacts_email_idx on client_contacts (email);

-- ─── Projets ────────────────────────────────────────────────────────
-- 'draft' = visible par toi seul ; les autres statuts sont visibles du client.
create type project_status as enum ('draft', 'active', 'review', 'done', 'archived');

create table projects (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  client_id   uuid not null references clients(id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 200),
  status      project_status not null default 'draft',
  description text,             -- partagée avec le client
  due_on      date,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index projects_client_idx on projects (client_id);

-- ─── Rattachement du flux existant ──────────────────────────────────
alter table items
  add column client_id  uuid references clients(id)  on delete set null,
  add column project_id uuid references projects(id) on delete set null;
create index items_client_idx  on items (client_id)  where client_id  is not null;
create index items_project_idx on items (project_id) where project_id is not null;

-- ─── updated_at ─────────────────────────────────────────────────────
create function touch_row() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;
create trigger clients_touch  before update on clients  for each row execute function touch_row();
create trigger projects_touch before update on projects for each row execute function touch_row();

-- ─── Périmètre d'un contact connecté ────────────────────────────────
create function my_client_ids() returns setof uuid
  language sql stable security definer set search_path = public as $$
  select client_id from client_contacts where user_id = auth.uid() and portal_access
$$;

-- ─── RLS ────────────────────────────────────────────────────────────
alter table clients         enable row level security;
alter table client_contacts enable row level security;
alter table projects        enable row level security;

create policy "admin clients"  on clients         for all using (is_admin() and owner_id = auth.uid()) with check (is_admin() and owner_id = auth.uid());
create policy "admin contacts" on client_contacts for all using (is_admin() and owner_id = auth.uid()) with check (is_admin() and owner_id = auth.uid());
create policy "admin projects" on projects        for all using (is_admin() and owner_id = auth.uid()) with check (is_admin() and owner_id = auth.uid());

create policy "portal clients"  on clients         for select using (id in (select my_client_ids()));
create policy "portal contacts" on client_contacts for select using (user_id = auth.uid());
create policy "portal projects" on projects        for select using (client_id in (select my_client_ids()) and status <> 'draft');

-- Les tables internes deviennent strictement admin : avant, n'importe quel
-- compte connecté pouvait y créer SES propres lignes via l'API (owner_id = lui).
drop policy "owner sources"    on sources;
drop policy "owner items"      on items;
drop policy "owner mail_rules" on mail_rules;
drop policy "owner emails"     on email_messages;

create policy "admin sources"    on sources    for all using (is_admin() and owner_id = auth.uid()) with check (is_admin() and owner_id = auth.uid());
create policy "admin items"      on items      for all using (is_admin() and owner_id = auth.uid()) with check (is_admin() and owner_id = auth.uid());
create policy "admin mail_rules" on mail_rules for all using (is_admin() and owner_id = auth.uid()) with check (is_admin() and owner_id = auth.uid());
create policy "admin emails"     on email_messages for select using (
  is_admin() and exists (select 1 from items i where i.id = item_id and i.owner_id = auth.uid())
);
