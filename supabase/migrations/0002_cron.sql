-- ════════════════════════════════════════════════════════════════════
-- Synchro toutes les 5 minutes via Supabase pg_cron + pg_net.
-- (Vercel Cron en plan Hobby ne tourne qu'une fois par jour : on passe
--  donc par Supabase pour la fréquence, Vercel reste en filet de sécurité.)
--
-- AVANT d'exécuter : remplace <APP_URL> et <CRON_SECRET>.
-- Mieux : stocke le secret dans Vault (Dashboard > Project Settings > Vault)
-- et lis-le avec vault.decrypted_secrets.
-- ════════════════════════════════════════════════════════════════════

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'cockpit-sync',
  '*/5 * * * *',
  $$
  select net.http_post(
    url     := '<APP_URL>/api/cron/sync',
    headers := jsonb_build_object(
      'Authorization', 'Bearer <CRON_SECRET>',
      'Content-Type',  'application/json'
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
  $$
);

-- Pour arrêter : select cron.unschedule('cockpit-sync');
