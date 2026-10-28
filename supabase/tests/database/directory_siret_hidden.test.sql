begin;
select plan(14);

-- Le SIRET n'est plus affiché dans l'annuaire public, mais reste enregistré à l'inscription du professionnel.
insert into auth.users(id,email,email_confirmed_at) values
 ('e1000000-0000-0000-0000-000000000001','siret-owner@example.test',now()),
 ('e1000000-0000-0000-0000-000000000002','siret-admin@example.test',now());
insert into public.platform_admins(user_id) values('e1000000-0000-0000-0000-000000000002');
insert into public.directory_businesses(siret,display_name,legal_name,naf_code,administrative_status,address_line,postal_code,city,department,source_url,source_checked_on,source_sha256)
values('73282932000074','Restaurant masqué','Société masquée','56.10C','A','1 rue de test','78190','TRAPPES','78','https://annuaire-entreprises.data.gouv.fr/etablissement/73282932000074',current_date,'fixture');
insert into public.merchants(id,owner_id,siret,slug,name,category,address_line,postal_code,city,latitude,longitude)
values('e2000000-0000-0000-0000-000000000001','e1000000-0000-0000-0000-000000000001','73282932000074','siret-masque','Restaurant masqué','restaurant','1 rue de test','78190','TRAPPES',48.78,1.99);
create temp table dir_ids as select siret,public_id from public.directory_businesses;grant select on dir_ids to authenticated;

-- 1. Annuaire public (anonyme) : la fiche est trouvée, sans SIRET ni lien qui le contienne.
set local role anon;
select is((public.search_pro_directory('Restaurant masqué')->>'total')::int,1,'anonyme : la fiche est trouvée par son nom');
select ok(not (public.search_pro_directory('Restaurant masqué')->'rows'->0 ? 'siret'),'anonyme : le résultat ne contient pas de champ siret');
select ok(not (public.search_pro_directory('Restaurant masqué')->'rows'->0 ? 'source_url'),'anonyme : le résultat ne contient pas de lien source (il contient le SIRET)');
select ok(public.search_pro_directory('Restaurant masqué')::text !~ '[0-9]{14}','anonyme : aucune suite de 14 chiffres dans toute la réponse');
select is((public.search_pro_directory('73282932000074')->>'total')::int,0,'anonyme : on ne retrouve plus une fiche en saisissant son SIRET');
select throws_ok($$select count(*) from public.directory_businesses$$,'42501',null,'anonyme : la table n’est plus lisible en direct (siret, source_url, legal_name)');
select ok(exists(select 1 from public.pro_directory_cities() where city='TRAPPES'),'anonyme : la liste des villes fonctionne toujours');
reset role;

-- 2. Connecté : même fermeture de la table.
set local request.jwt.claims='{"sub":"e1000000-0000-0000-0000-000000000001","role":"authenticated"}';
set local role authenticated;
select throws_ok($$select siret from public.directory_businesses$$,'42501',null,'connecté : la table n’est pas lisible en direct');

-- 3. Revendication par identifiant public ; le SIRET est retrouvé côté serveur.
create temp table claim_test(id uuid);grant all on claim_test to authenticated;
select lives_ok($$insert into claim_test select public.request_directory_claim((select public_id from dir_ids where siret='73282932000074'),'Gérant','Je représente ce commerce et peux fournir des justificatifs.')$$,'connecté : une revendication se fait avec l’identifiant public');
select throws_ok($$select public.request_directory_claim('00000000-0000-0000-0000-000000000000','Gérant','Je représente ce commerce et peux fournir des justificatifs.')$$,'P0002','Établissement introuvable','identifiant inconnu : refusé');
select is((select siret from public.directory_claims where id=(select id from claim_test)),'73282932000074','le SIRET de la demande est retrouvé côté serveur');
reset role;
select hasnt_function('public','request_directory_claim',array['text','text','text','text'],'l’ancienne revendication par SIRET n’existe plus');

-- 4. Le SIRET reste connu des administrateurs (revue) et du professionnel (profil à l'inscription).
set local request.jwt.claims='{"sub":"e1000000-0000-0000-0000-000000000002","role":"authenticated"}';
set local role authenticated;
select is(public.admin_directory_claims()->'rows'->0->>'siret','73282932000074','administrateur : le SIRET reste visible dans la file de revue');
reset role;
set local request.jwt.claims='{"sub":"e1000000-0000-0000-0000-000000000001","role":"authenticated"}';
set local role authenticated;
select is((select siret from public.merchants where owner_id='e1000000-0000-0000-0000-000000000001'),'73282932000074','professionnel : le SIRET saisi à l’inscription est conservé');
reset role;

select * from finish();
rollback;
