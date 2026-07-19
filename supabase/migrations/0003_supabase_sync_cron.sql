-- 0003_supabase_sync_cron.sql
-- Schedules provider status sync every 10 minutes via pg_cron + pg_net.
-- Requires Vault secrets:
--   app_url      -> e.g. https://your-app.vercel.app
--   cron_secret  -> same value as CRON_SECRET in Vercel env

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Remove prior schedule if it exists so reruns are safe.
do $$
declare
  existing_job_id bigint;
begin
  select jobid into existing_job_id
  from cron.job
  where jobname = 'orders-sync-every-10-min';

  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;
end
$$;

select cron.schedule(
  'orders-sync-every-10-min',
  '*/10 * * * *',
  $$
  select
    net.http_get(
      url := (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'app_url'
      ) || '/api/cron/sync-orders?secret=' || (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'cron_secret'
      )
    );
  $$
);
