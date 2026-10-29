-- =============================================================================
-- OPCIONAL: agenda a rotina de retenção diariamente com pg_cron.
-- Execute manualmente no SQL Editor do projeto Supabase (não é migração
-- automática porque depende da extensão pg_cron estar habilitada).
-- =============================================================================

create extension if not exists pg_cron with schema pg_catalog;

-- Todos os dias às 03:30 UTC.
select cron.schedule(
  'acolher-retencao-diaria',
  '30 3 * * *',
  $$ select public.purge_expired_data(); $$
);

-- Para remover:
-- select cron.unschedule('acolher-retencao-diaria');
