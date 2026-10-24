-- Reprise fidèle d'une migration appliquée directement sur le projet hébergé (version 20261023101518).
do $hardening$
declare v record;
begin
  for v in
    select p.oid::regprocedure as signature
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname = any(array['max_courier_deliveries','mission_wait_minutes','courier_online_window','grouping_max_pickup_gap_m','grouping_max_drop_gap_m','grouping_max_ready_gap_minutes','marketing_daily_capacity'])
      and not exists (select 1 from pg_catalog.unnest(coalesce(p.proconfig,array[]::text[])) c where c like 'search_path=%')
  loop
    execute format('alter function %s set search_path = %L',v.signature,'');
  end loop;
end
$hardening$;
