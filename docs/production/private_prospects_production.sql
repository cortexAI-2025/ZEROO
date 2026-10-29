-- ZeeRoo : annuaire public = affiliés uniquement ; fiches Sirene = base privée (migration 20261029110000_private_prospects).
-- À coller en une seule fois dans l'éditeur SQL Supabase du projet rgxesocsvhgsqoehxhgt, puis « Run ».
-- Transaction unique : en cas d'erreur, rien n'est appliqué. Aucune fiche n'est supprimée (contrôle final : 2 390).
-- Ordre : exécuter ce script, vérifier les résultats, puis seulement fusionner la PR du site (zeroo_mainpage #64).
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';
create temp table zeeroo_avant as select count(*) as n from public.directory_businesses;
do $$ begin
  if exists (select 1 from supabase_migrations.schema_migrations where version = '20261029110000') then
    raise exception 'Migration 20261029110000 déjà enregistrée : rien à faire';
  end if;
  -- Précondition explicite : 2 390 fiches attendues (état constaté le 29/10/2026).
  if (select n from zeeroo_avant) <> 2390 then
    raise exception 'directory_businesses contient % fiches au lieu de 2390 : inspecter avant d''appliquer', (select n from zeeroo_avant);
  end if;
  -- Accès indirects : aucune autre fonction, vue ou vue matérialisée ne doit dépendre des objets retirés.
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname in ('public','admin_private') and p.prokind = 'f'
               and p.proname not in ('search_pro_directory','pro_directory_cities','request_directory_claim')
               and p.prosrc ~* '(search_pro_directory|pro_directory_cities|request_directory_claim)') then
    raise exception 'Une autre fonction appelle l''ancien annuaire : inspecter avant d''appliquer';
  end if;
  if exists (select 1 from pg_class c where c.relkind in ('v','m') and c.relnamespace = 'public'::regnamespace
             and pg_get_viewdef(c.oid) ~* 'directory_(businesses|claims)') then
    raise exception 'Une vue lit directory_businesses / directory_claims : inspecter avant d''appliquer';
  end if;
end $$;

-- Annuaire public = restaurants affiliés uniquement ; fiches Sirene = base privée de prospection.
--
-- Avant : public.directory_businesses (2 390 fiches Sirene, SIRET compris) était lisible en direct par
-- anon et authenticated, et exposée par search_pro_directory / pro_directory_cities (SIRET et lien source
-- contenant le SIRET), avec une revendication par SIRET (request_directory_claim).
-- Après : plus aucun accès public ni fonction de recherche ; les fiches restent en base (aucune
-- suppression) pour la prospection, lisibles seulement par le propriétaire de la base et par les
-- fonctions SECURITY DEFINER de l'administration. L'annuaire public reste celui des affiliés
-- (merchants publiés, mini-sites, QR codes).

-- Fonctions publiques de l'ancien annuaire général (toutes signatures connues, y compris la variante
-- uuid de la première version de la correction).
drop function if exists public.search_pro_directory(text, text, integer);
drop function if exists public.pro_directory_cities();
drop function if exists public.request_directory_claim(text, text, text, text);
drop function if exists public.request_directory_claim(uuid, text, text, text);
drop function if exists admin_private.request_directory_claim(text, text, text, text);
drop function if exists admin_private.request_directory_claim(uuid, text, text, text);

-- Fermeture des tables : plus de lecture directe par l'API, ni pour les fiches, ni pour les demandes.
drop policy if exists "listed directory references" on public.directory_businesses;
drop policy if exists "claimant reads own claims" on public.directory_claims;
revoke all on public.directory_businesses from public, anon, authenticated;
revoke all on public.directory_claims from public, anon, authenticated;
-- RLS reste active (aucune politique pour les rôles de l'API) : refus par défaut même en cas de nouveau grant.
alter table public.directory_businesses enable row level security;
alter table public.directory_claims enable row level security;

-- Contrôles : tout doit être vrai, sinon la transaction est annulée.
do $$ begin
  if (select count(*) from public.directory_businesses) <> (select n from zeeroo_avant) then raise exception 'Nombre de fiches modifié'; end if;
  if has_table_privilege('anon','public.directory_businesses','SELECT') or has_table_privilege('authenticated','public.directory_businesses','SELECT') then raise exception 'directory_businesses encore lisible'; end if;
  if has_table_privilege('anon','public.directory_claims','SELECT') or has_table_privilege('authenticated','public.directory_claims','SELECT') then raise exception 'directory_claims encore lisible'; end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','admin_private') and p.proname in ('search_pro_directory','pro_directory_cities','request_directory_claim')) then raise exception 'fonction de l''ancien annuaire encore présente'; end if;
end $$;

insert into supabase_migrations.schema_migrations (version, name) values ('20261029110000', 'private_prospects');
select (select n from zeeroo_avant) as fiches_avant, (select count(*) from public.directory_businesses) as fiches_apres;
commit;
