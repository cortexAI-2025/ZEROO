-- Vérifications en LECTURE SEULE du projet hébergé (SQL Editor). Aucune valeur secrète n'est lue.

-- 1. Historique des migrations : doit égaler le nombre de fichiers de supabase/migrations/
select count(*) as migrations_appliquees, max(version) as derniere from supabase_migrations.schema_migrations;

-- 2. Tables publiques sans RLS (attendu : aucune ligne)
select c.relname as table_sans_rls from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;

-- 3. Adresse précise : table fermée au public (attendu : false, false)
select has_table_privilege('anon', 'public.merchant_locations', 'select') as anon_peut_lire,
       has_table_privilege('authenticated', 'public.merchant_locations', 'select') as connecte_peut_lire;

-- 4. Extensions requises (attendu : postgis, pg_cron, pg_net, unaccent, supabase_vault)
select extname from pg_extension where extname in ('postgis', 'pg_cron', 'pg_net', 'unaccent', 'supabase_vault') order by 1;

-- 5. Secrets Vault attendus : NOMS seulement (attendu : cron_secret, functions_url)
select name from vault.secrets where name in ('functions_url', 'cron_secret') order by 1;

-- 6. Tâches planifiées, sans doublon (attendu : une ligne par nom)
select jobname, schedule, active, count(*) over (partition by jobname) as exemplaires from cron.job order by jobname;

-- 7. Dernières exécutions des tâches (attendu : status = succeeded)
select j.jobname, d.status, d.start_time, left(d.return_message, 120) as message
from cron.job_run_details d join cron.job j using (jobid) order by d.start_time desc limit 15;

-- 8. Aucun compte de démonstration à mot de passe connu (attendu : aucune ligne)
select email from auth.users where email like '%@test.fr' or email like '%@example.com';

-- 9. Buckets de stockage et leur visibilité
select id, public from storage.buckets order by id;
