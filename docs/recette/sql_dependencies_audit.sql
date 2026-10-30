-- Audit des dépendances SQL des six colonnes déplacées vers merchant_private (lecture seule, à lancer sur la
-- PRODUCTION avant la bascule et à archiver). Résultat attendu avant bascule : seules les lignes listées dans
-- docs/production/PLAN-BASCULE-MERCHANTS.md §1bis (fonctions déjà migrées par le script) ; toute AUTRE ligne = STOP.
-- Colonnes : legal_name, siret, vat_number, contact_email, phone, payment_link (de public.merchants).
with cols as (select unnest(array['legal_name','siret','vat_number','contact_email','payment_link']) as c)
select 'fonction' as type, n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' as objet,
       case when p.prosecdef then 'security definer' else 'invoker' end as detail
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname not in ('pg_catalog','information_schema','extensions','auth','storage','vault','net','cron','graphql','graphql_public','realtime','pgsodium','supabase_functions','supabase_migrations','pgbouncer')
  and p.prokind in ('f','p')
  and (p.prosrc ~* '\m(legal_name|siret|vat_number|contact_email|payment_link)\M'
       or p.prosrc ~* '(merchants|\mm|\mmer)\.phone\M' or p.prosrc ~* 'merchants[^;]*\mphone\M')
union all
select 'vue', n.nspname||'.'||c.relname, c.relkind::text
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where c.relkind in ('v','m') and n.nspname not in ('pg_catalog','information_schema')
  and pg_get_viewdef(c.oid) ~* 'merchants'
  and pg_get_viewdef(c.oid) ~* '\m(legal_name|siret|vat_number|contact_email|payment_link|phone)\M'
union all
select 'politique RLS', schemaname||'.'||tablename||' : '||policyname, cmd
from pg_policies
where coalesce(qual,'')||coalesce(with_check,'') ~* '\m(legal_name|siret|vat_number|contact_email|payment_link)\M'
union all
select 'tâche pg_cron', coalesce(jobname, jobid::text), left(command, 120)
from cron.job
where command ~* '\m(legal_name|siret|vat_number|contact_email|payment_link|phone)\M'
union all
select 'index', schemaname||'.'||indexname, left(indexdef, 120)
from pg_indexes
where tablename='merchants' and indexdef ~* '\m(legal_name|siret|vat_number|contact_email|payment_link|phone)\M'
union all
select 'contrainte', conname, left(pg_get_constraintdef(oid), 120)
from pg_constraint
where conrelid='public.merchants'::regclass and pg_get_constraintdef(oid) ~* '\m(legal_name|siret|vat_number|contact_email|payment_link|phone)\M'
union all
select 'déclencheur sur merchants', tgname, pg_get_triggerdef(oid)
from pg_trigger where tgrelid='public.merchants'::regclass and not tgisinternal
order by 1, 2;
