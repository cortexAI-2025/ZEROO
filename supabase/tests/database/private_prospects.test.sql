begin;
select plan(14);

-- Annuaire public = affiliés uniquement ; fiches Sirene = base privée de prospection (aucun accès API).
insert into auth.users(id,email,email_confirmed_at) values
 ('e1000000-0000-0000-0000-000000000001','prospect-owner@example.test',now()),
 ('e1000000-0000-0000-0000-000000000002','prospect-admin@example.test',now());
insert into public.platform_admins(user_id) values('e1000000-0000-0000-0000-000000000002');
insert into public.directory_businesses(siret,display_name,legal_name,naf_code,administrative_status,address_line,postal_code,city,department,source_url,source_checked_on,source_sha256)
values('73282932000074','Prospect privé','Société privée','56.10C','A','1 rue de test','78190','TRAPPES','78','https://annuaire-entreprises.data.gouv.fr/etablissement/73282932000074',current_date,'fixture');
insert into public.directory_claims(siret,claimant_user_id,contact_email,capacity,evidence_note)
values('73282932000074','e1000000-0000-0000-0000-000000000001','prospect-owner@example.test','Gérant','Demande historique conservée pour contrôle');
insert into public.merchants(id,owner_id,siret,slug,name,category,address_line,postal_code,city,latitude,longitude)
values('e2000000-0000-0000-0000-000000000001','e1000000-0000-0000-0000-000000000001','73282932000074','prospect-affilie','Affilié','restaurant','1 rue de test','78190','TRAPPES',48.78,1.99);

-- 1. Anonyme : aucune lecture de la base de prospection, aucune fonction de recherche.
set local role anon;
select throws_ok($$select count(*) from public.directory_businesses$$,'42501',null,'anonyme : directory_businesses fermée');
select throws_ok($$select siret from public.directory_businesses$$,'42501',null,'anonyme : le SIRET n’est pas lisible');
select throws_ok($$select count(*) from public.directory_claims$$,'42501',null,'anonyme : directory_claims fermée');
reset role;
select hasnt_function('public','search_pro_directory',array['text','text','integer'],'plus de recherche publique dans l’annuaire général');
select hasnt_function('public','pro_directory_cities',array[]::text[],'plus de liste de villes de l’annuaire général');
select hasnt_function('public','request_directory_claim',array['text','text','text','text'],'plus de revendication par SIRET');
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','admin_private') and p.proname in ('search_pro_directory','pro_directory_cities','request_directory_claim')),0,'aucune variante de ces fonctions ne subsiste');

-- 2. Connecté (propriétaire d'un commerce) : même fermeture.
set local request.jwt.claims='{"sub":"e1000000-0000-0000-0000-000000000001","role":"authenticated"}';
set local role authenticated;
select throws_ok($$select count(*) from public.directory_businesses$$,'42501',null,'connecté : directory_businesses fermée');
select throws_ok($$select count(*) from public.directory_claims$$,'42501',null,'connecté : directory_claims fermée');
reset role;

-- 3. Aucun privilège de table pour les rôles de l'API, RLS active.
select ok(not has_table_privilege('anon','public.directory_businesses','SELECT') and not has_table_privilege('authenticated','public.directory_businesses','SELECT'),'aucun SELECT sur directory_businesses pour anon / authenticated');
select ok((select relrowsecurity from pg_class where oid='public.directory_businesses'::regclass),'RLS active sur directory_businesses');

-- 4. Les fiches sont conservées et restent accessibles à l'administration (SIRET compris).
select is((select count(*)::int from public.directory_businesses where siret='73282932000074'),1,'la fiche de prospection est conservée en base');
set local request.jwt.claims='{"sub":"e1000000-0000-0000-0000-000000000002","role":"authenticated"}';
set local role authenticated;
select is(public.admin_directory_claims()->'rows'->0->>'siret','73282932000074','administrateur : le SIRET reste visible dans l’espace admin');
reset role;

-- 5. L'annuaire des affiliés n'est pas touché et le SIRET du professionnel est conservé à l'inscription.
select is((select siret from public.merchants where owner_id='e1000000-0000-0000-0000-000000000001'),'73282932000074','professionnel : SIRET d’inscription conservé');

select * from finish();
rollback;
